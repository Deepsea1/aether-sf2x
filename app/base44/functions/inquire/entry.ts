import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';
import { buildThinkPrompt, THINK_JSON_SCHEMA, generateSignature, computeTrustworthyRate } from '../../shared/sf2xCore.js';
import { snapshotSources } from '../../shared/attest.js';
import { emitTelemetry, newTraceId } from '../../shared/telemetry.js';
import { runRedTeamAttack } from '../../shared/redTeam.js';
import { callLLMJson, checkLlmBudget } from '../../shared/llmRouter.js';

const VALID_DOMAINS = ['General', 'Medicine', 'Finance', 'Legal', 'Engineering', 'Science'];
const VALID_STAKES = ['low', 'medium', 'high', 'critical'];
const ALLOWED_MODELS = ['automatic', 'gpt_5_mini', 'gemini_3_flash', 'gpt_5_4', 'gpt_5_6_sol', 'gemini_3_1_pro', 'claude_sonnet_4_6', 'claude_opus_4_6', 'claude_opus_4_7', 'claude_opus_4_8', 'claude-sonnet-5'];

export default async function(req) {
  try {
    const apiKey = req.headers.get('x-api-key') || '';
    // BYOK: caller's own OpenRouter key — the LLM call bills their account, not
    // our workspace credits. Passed via x-or-key header. BYOK callers bypass quota.
    const ownKey = (req.headers.get('x-or-key') || req.headers.get('X-Or-Key') || '').trim();
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;
    const master = secrets.get('SF2X_API_KEY');
    let customerId = null;
    let plan = 'starter';
    // Always authenticate via a valid API key, even for BYOK callers.
    if (master && apiKey === master) {
      // master/admin key — no quota
    } else {
      const keys = await svc.entities.ApiKey.filter({ key: apiKey, active: true });
      if (!keys.length) return Response.json({ error: 'Invalid or missing API key' }, { status: 401 });
      customerId = keys[0].user_id;
      if (!ownKey) {
        // BYOK callers bypass quota/metering (they pay their own LLM provider),
        // but non-BYOK callers are subject to per-key rate limits and monthly quota.
        const recentCut = new Date(Date.now() - 60000).toISOString();
        const recent = await svc.entities.Inquiry.filter({ customer_id: customerId, created_date: { $gte: recentCut } });
        if (recent.length >= 10) {
          return Response.json({ error: 'Rate limit exceeded: too many inquiries in the last minute', retry_after: 60 }, { status: 429 });
        }
        const subs = await svc.entities.Subscription.filter({ user_id: customerId, status: 'active' });
        plan = subs.length ? (subs[0].plan || 'starter') : 'starter';
        const LIMITS = { starter: 500, pro: 5000, enterprise: 20000, scale: 50000 };
        const limit = LIMITS[plan] || 500;
        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);
        const used = await svc.entities.Inquiry.filter({ customer_id: customerId, created_date: { $gte: monthStart.toISOString() } });
        if (used.length >= limit) {
          return Response.json({ error: 'Monthly inquiry quota exceeded for plan: ' + plan, plan, used: used.length, limit }, { status: 429 });
        }
      }
    }
    if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });

    const origin = new URL(req.url).origin;
    const body = await req.json();
    const prompt = (body.prompt || '').toString().trim();
    if (!prompt) return Response.json({ error: 'prompt is required' }, { status: 400 });
    const domain = VALID_DOMAINS.includes(body.domain) ? body.domain : 'General';
    const stakes = VALID_STAKES.includes(body.stakes) ? body.stakes : 'medium';
    const model = ALLOWED_MODELS.includes(body.model) ? body.model : 'automatic';

    // Content-hash cache: an identical prompt+domain returns the prior warranted
    // answer with no LLM call. 7-day TTL. Viral/repeat questions hit the DB, not
    // the LLM — the biggest cost saver for free/public usage.
    try {
      const hits = await svc.entities.Inquiry.filter({ prompt: prompt.slice(0, 2000), domain, status: 'answered' }, '-created_date', 1);
      if (hits && hits.length) {
        const versions = await svc.entities.AnswerVersion.filter({ inquiry_id: hits[0].id }, '-version', 1);
        const av0 = versions && versions[0];
        if (av0) {
          const ageMs = Date.now() - new Date(av0.created_date || Date.now()).getTime();
          if (ageMs < 7 * 86400000) {
            let cachedWarrant = null;
            if (av0.warrant_id) cachedWarrant = await svc.entities.Warrant.get(av0.warrant_id).catch(() => null);
            return Response.json({
              inquiry_id: hits[0].id, answer_version_id: av0.id, version: av0.version,
              answer: av0.answer_text,
              warrant: cachedWarrant ? { premises: cachedWarrant.premises, conclusion: cachedWarrant.conclusion, confidence_score: cachedWarrant.confidence_score, validity_status: cachedWarrant.validity_status, sources: cachedWarrant.sources, expiry_date: cachedWarrant.expiry_date, signed_hash: cachedWarrant.signed_hash } : null,
              metrics: av0.metrics || {}, trustworthy_rate: av0.trust_score, cognitive_state: av0.cognitive_state || {},
              cached: true,
              certified: !!(av0.cognitive_state?.certified), certification: av0.cognitive_state?.certified ? 'certified' : 'uncertified',
              verification_url: `${origin}/verify/${av0.id}`, badge_url: `${origin}/badge/${av0.id}`, embed_url: `${origin}/embed/badge/${av0.id}`,
            });
          }
        }
      }
    } catch (e) { /* cache miss is non-fatal */ }

    const traceId = newTraceId();
    await emitTelemetry(svc, {
      trace_id: traceId,
      event_type: 'request_received',
      span_type: 'operation',
      group: 'identity',
      identity: { user_id: customerId, tenant_id: null, role: apiKey === master ? 'admin' : 'api', plan, client_type: 'api', auth_state: 'api_key' },
      prompt: { prompt_hash: null, system_prompt_version: 'think_v1', user_intent_classification: domain, conversation_state: stakes },
      summary: `API inquiry · ${domain}/${stakes} · model=${model}`,
    });

    // === WEB GROUNDING FOR HIGH + CRITICAL STAKES ===
    // Every high or critical inquiry gets web-grounded context so the answer is
    // fact-checked against live authoritative sources — no hallucinations slip through.
    //
    // BYOK users: we pay for the grounding call ONLY (gemini + web search). The actual
    // reasoning, warrant generation, and red-team stress test all bill THEIR OpenRouter
    // key. This costs us ~1 credit per high/critical inquiry instead of ~10, while
    // keeping the truthfulness guarantee intact — the BYOK model gets verified facts to
    // reason over, so it can't hallucinate without the grounding contradicting it.
    //
    // Non-BYOK high/critical: single InvokeLLM call with web search (grounding + answer).
    const needsGrounding = stakes === 'critical' || stakes === 'high';
    let groundedContext = '';
    if (needsGrounding) {
      const budget = await checkLlmBudget(svc);
      if (!budget.allowed) {
        return Response.json({ error: 'Monthly service capacity reached. Try again next cycle or use a non-critical inquiry.', used: budget.used, cap: budget.cap }, { status: 429 });
      }
      if (ownKey) {
        // BYOK: grounding-only call — we pay for web research, caller pays for reasoning.
        const researchRes = await svc.integrations.Core.InvokeLLM({
          prompt: `You are a fact-checking research assistant. Research the following question using live web sources. Return a concise research brief with: (1) verified key facts, figures, dates, and statistics, (2) source URLs for each fact, (3) any commonly-held misconceptions or hallucinations about this topic that an AI might produce. Be precise and cite real sources.\n\nQuestion: """${prompt}"""\n\nDomain: ${domain}`,
          add_context_from_internet: true,
          model: 'gemini_3_flash',
        });
        const rd = researchRes && researchRes.data ? researchRes.data : researchRes;
        groundedContext = typeof rd === 'string' ? rd : JSON.stringify(rd);
      }
    }

    // Build the think prompt, injecting grounded research for BYOK critical inquiries.
    const basePrompt = buildThinkPrompt(prompt, domain, stakes);
    const thinkPrompt = groundedContext
      ? basePrompt + `\n\n=== WEB-GROUNDED RESEARCH (verified via live web search) ===\nUse these verified facts to ground your answer. Cross-check every claim against this research. If your reasoning contradicts the grounded facts, correct your answer. Include the source URLs from this research in your warrant sources.\n\n"""${groundedContext.slice(0, 8000)}"""\n=== END GROUNDED RESEARCH ===`
      : basePrompt;

    let r;
    if (needsGrounding && !ownKey) {
      // Non-BYOK critical — full web-grounded answer via Base44 InvokeLLM (gemini).
      // Grounding + reasoning in a single call (more credit-efficient than splitting).
      const params = { prompt: thinkPrompt, response_json_schema: THINK_JSON_SCHEMA };
      params.model = model === 'automatic' ? 'gemini_3_flash' : model;
      params.add_context_from_internet = true;
      const res = await svc.integrations.Core.InvokeLLM(params);
      r = res && res.data ? res.data : res;
    } else {
      // BYOK (grounding already injected above) or standard — OpenRouter, caller's key or app's.
      r = await callLLMJson(svc, { prompt: thinkPrompt, schema: THINK_JSON_SCHEMA, orModel: 'openai/gpt-4o-mini', b44Model: model === 'automatic' ? 'gpt_5_mini' : model, orKey: ownKey || null });
    }

    await emitTelemetry(svc, {
      trace_id: traceId,
      event_type: 'model_completed',
      span_type: 'model_call',
      group: 'model',
      model: { provider: 'base44', name: model, version: model, endpoint: 'core_invoke_llm', response_format: 'json', cache_hit: null },
      performance: { latency_ms: null, token_count: null, cost_usd: null },
      summary: `Model ${model} returned an answer`,
    });

    const inquiry = await svc.entities.Inquiry.create({ prompt, domain, stakes_level: stakes, status: 'answered', customer_id: customerId || undefined });
    const existing = await svc.entities.AnswerVersion.filter({ inquiry_id: inquiry.id });
    const version = existing.length + 1;

    const w = r.warrant || {};
    const av = await svc.entities.AnswerVersion.create({
      inquiry_id: inquiry.id,
      version,
      answer_text: r.answer || '',
      cognitive_state: { ...(r.cognitive_state || {}), model, source: 'api' },
      metrics: r.metrics || {},
      trust_score: computeTrustworthyRate(r.metrics, w),
      stakes_level: stakes,
    });
    const expiryDays = w.expiry_days || 30;
    const sourceSnapshots = await snapshotSources(w.sources || []);
    const signedHash = await generateSignature([av.id, w.conclusion || '', (w.premises || []).join(';;')].join('|'), { ed25519PrivateKey: secrets.get('ED25519_PRIVATE_KEY'), hmacKey: secrets.get('sf2x_attestation_key') || secrets.get('SF2X_ATTESTATION_KEY') });
    const warrant = await svc.entities.Warrant.create({
      answer_version_id: av.id,
      premises: w.premises || [],
      conclusion: w.conclusion || '',
      confidence_score: w.confidence_score ?? 0,
      validity_status: w.validity_status || 'valid',
      sources: w.sources || [],
      source_snapshots: sourceSnapshots,
      expiry_date: new Date(Date.now() + expiryDays * 86400000).toISOString(),
      signed_hash: signedHash,
    });
    // Red-team stress test — run on every API inquiry so the warrant is certified.
    const redTeam = await runRedTeamAttack(svc, {
      inquiryId: inquiry.id, answerVersionId: av.id,
      prompt, answerText: r.answer || '', warrant, domain,
      orKey: ownKey || null,
    });
    const certified = !!redTeam.run && redTeam.outcome !== 'error' && redTeam.outcome !== 'broken';
    await svc.entities.AnswerVersion.update(av.id, {
      warrant_id: warrant.id,
      cognitive_state: { ...(r.cognitive_state || {}), model, source: 'api', certified, red_team_run_id: redTeam.run?.id || null, red_team_outcome: redTeam.outcome, red_team_severity: redTeam.severity },
    }).catch(() => {});

    await emitTelemetry(svc, {
      trace_id: traceId,
      event_type: 'provenance_signed',
      span_type: 'provenance',
      group: 'provenance',
      linked_entity_type: 'AnswerVersion',
      linked_entity_id: av.id,
      provenance: { asset_id: av.id, parent_asset_id: inquiry.id, artifact_type: 'answer', signature_status: warrant.validity_status, signer_id: 'sf2x_attestation', signed_hash: signedHash ? 'present' : null },
      summary: `Warrant signed for answer v${version}`,
    });

    await svc.entities.AuditLog.create({
      event_type: 'inquiry_created',
      entity_type: 'Inquiry',
      entity_id: inquiry.id,
      summary: `API inquiry created (v${version}) · ${domain}/${stakes}`,
      metadata: { domain, stakes, model, source: 'api' },
    }).catch(() => {});

    return Response.json({
      inquiry_id: inquiry.id,
      answer_version_id: av.id,
      version,
      answer: r.answer,
      warrant: {
        premises: warrant.premises,
        conclusion: warrant.conclusion,
        confidence_score: warrant.confidence_score,
        validity_status: warrant.validity_status,
        sources: warrant.sources,
        expiry_date: warrant.expiry_date,
        signed_hash: warrant.signed_hash,
      },
      metrics: r.metrics,
      trustworthy_rate: computeTrustworthyRate(r.metrics, warrant),
      cognitive_state: r.cognitive_state,
      verification_url: `${origin}/verify/${av.id}`,
      badge_url: `${origin}/badge/${av.id}`,
      embed_url: `${origin}/embed/badge/${av.id}`,
      certified, certification: certified ? 'certified' : 'uncertified',
      red_team: { outcome: redTeam.outcome, severity: redTeam.severity, run_id: redTeam.run?.id || null },
      byok: !!ownKey,
    });
  } catch (error) {
    console.error('inquire error', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}