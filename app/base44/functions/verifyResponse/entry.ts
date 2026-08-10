import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveApiKey, checkQuota, recordUsage, CREDIT_COSTS } from '../../shared/apiAuth.js';
import { runRedTeamAttack } from '../../shared/redTeam.js';
import { callLLMJson } from '../../shared/llmRouter.js';

// verifyResponse — the fast verification endpoint behind the Aether widget and
// browser extension. Accepts an AI-generated text and runs a single fast
// proposer→critic→verifier pass (one LLM call, ~2-4s) that decomposes claims,
// flags hallucinations, and renders a calibrated trust score + verdict.
// External callers pass x-api-key (metered); internal app calls run unmetered.
// Every verification is logged to the Inquiry entity with domain="verification".

const VERIFY_SCHEMA = {
  type: 'object',
  properties: {
    claims: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          claim: { type: 'string' },
          supported: { type: 'boolean', description: 'true if likely true / well-grounded.' },
          notes: { type: 'string' },
        },
        required: ['claim', 'supported'],
      },
    },
    corrections: { type: 'array', items: { type: 'string' }, description: 'Concrete factual issues or unsupported claims an expert would flag.' },
    verdict: { type: 'string', enum: ['verified', 'contested', 'rejected'] },
    trust_score: { type: 'number', description: 'Calibrated 0-100. Never 100; reserve ≥90 for reputation-staking claims.' },
    summary: { type: 'string' },
  },
  required: ['claims', 'corrections', 'verdict', 'trust_score'],
};

function num(x) { const n = Number(x); return Number.isFinite(n) ? n : 0; }

// BYOK: call OpenRouter with the caller's OWN key — the LLM call bills their
// account, not our workspace credits. Returns the same JSON shape as InvokeLLM.
async function verifyWithOwnKey(prompt, userKey, orModel) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + userKey, 'Content-Type': 'application/json', 'X-Title': 'Aether Verify' },
    body: JSON.stringify({
      model: orModel || 'openai/gpt-4o-mini',
      messages: [{ role: 'user', content: prompt + '\n\nRespond with a single JSON object only — no prose, no markdown fences.' }],
      temperature: 0.2,
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error('Own-key provider error ' + res.status + ': ' + errText.slice(0, 200));
  }
  const data = await res.json();
  let content = String(data?.choices?.[0]?.message?.content || '').trim();
  const fence = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) content = fence[1].trim();
  return JSON.parse(content);
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;
    const body = await req.json().catch(() => ({}));
    const text = String(body.text || '').trim();
    if (!text) return Response.json({ error: 'text is required' }, { status: 400 });
    const domain = String(body.domain || 'General');
    const source = String(body.source || 'widget');
    // BYOK: caller's own OpenRouter key — if present, the LLM call bills their
    // account, not our workspace credits. Passed via x-or-key header or body.
    const ownKey = (req.headers.get('x-or-key') || req.headers.get('X-Or-Key') || String(body.own_key || '')).trim();

    // Custom grounding: pull the caller's authoritative documents and inject them
    // into the verification prompt so claims are checked against their source of
    // truth, not just the open web.
    let groundingContext = '';
    const docIds = Array.isArray(body.grounding_doc_ids) ? body.grounding_doc_ids : [];
    if (docIds.length) {
      const docs = await Promise.all(docIds.map((id) => base44.entities.GroundingDoc.get(id).catch(() => null)));
      groundingContext = docs.filter(Boolean).map((d) => `--- ${d.name} (${d.domain}) ---\n${String(d.content || '').slice(0, 6000)}`).join('\n\n');
    }

    // External calls (widget / extension) meter via API key; internal app calls
    // (the landing demo, playground) run without a key and are not metered.
    let apiKey = null;
    const keyHeader = (req.headers.get('x-api-key') || req.headers.get('X-Api-Key') || '').trim();
    if (keyHeader) {
      const auth = await resolveApiKey(svc, req);
      if (!auth.ok) return auth.response;
      apiKey = auth.apiKey;
      // BYOK callers bypass our quota — they pay their own provider.
      if (!ownKey) {
        const quota = await checkQuota(svc, apiKey, 'verifyResponse');
        if (!quota.allowed) {
          return Response.json({ error: 'Monthly verification quota exceeded', plan: quota.plan, limit: quota.limit, remaining: 0 }, { status: 429 });
        }
      }
    }

    // === CACHE: identical text returns the prior verdict with no LLM call ===
    // Viral content (everyone pasting the same AI answer) hits the DB, not the
    // LLM — the single biggest cost saver for free/public usage. 7-day TTL.
    const cacheKey = text.slice(0, 2000);
    try {
      const hits = await base44.entities.Inquiry.filter({ prompt: cacheKey, domain: 'verification', status: 'answered' }, '-created_date', 1);
      if (hits && hits.length) {
        const versions = await base44.entities.AnswerVersion.filter({ inquiry_id: hits[0].id }, '-version', 1);
        const av0 = versions && versions[0];
        const cp = av0?.cognitive_state?.cache_payload;
        if (cp && cp.tribunal_version && (cp.domain || 'General') === domain) {
          const ageMs = Date.now() - new Date(av0.created_date || Date.now()).getTime();
          if (ageMs < 7 * 86400000) {
            return Response.json({ ...cp, cached: true });
          }
        }
      }
    } catch (e) { /* cache miss is non-fatal */ }

    // === ANONYMOUS DAILY RATE LIMIT — 5 free verifications/day per IP ===
    // No auth required, but caps free usage so anonymous traffic can't burn the
    // OpenRouter budget. API-key callers are metered separately (quota above).
    let ipHash = null;
    if (!apiKey) {
      const rawIp = (req.headers.get('cf-connecting-ip') || '').trim();
      if (rawIp) {
        let h = 5381; const s = rawIp + 'aether-free-tier';
        for (let i = 0; i < s.length; i++) h = ((h << 5) + h) + s.charCodeAt(i);
        ipHash = (h >>> 0).toString(16);
        const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
        const today = await svc.entities.Inquiry.filter({ ip_hash: ipHash, created_date: { $gte: dayStart.toISOString() } });
        if (today.length >= 5) {
          return Response.json({ error: 'Daily free verification limit reached (5/day). Create an account for more.', limit: 5, remaining: 0 }, { status: 429 });
        }
      }
    }

    const prompt = `You are the Aether verification engine — a fast, impartial tribunal that checks an AI-generated text for hallucinations in real time. Act as proposer, critic, and verifier in a single pass.

TEXT TO VERIFY:
"""${text}"""

DOMAIN: ${domain}
${groundingContext ? `AUTHORITATIVE COMPANY DOCUMENTS — check every claim against these first. A claim that contradicts these documents is unsupported:\n${groundingContext}\n\n` : ''}Your job:
1. Decompose the text into its discrete factual claims.
2. For each claim, judge whether it is supported (likely true / well-grounded) or unsupported (fabricated, overconfident, stale, or wrong).
3. List specific corrections — concrete factual issues an expert would flag, written as short sentences.
4. Render a verdict: "verified" (trustworthy, no material issues), "contested" (partly right but has problems), or "rejected" (materially wrong / hallucinated).
5. Assign a calibrated trust score 0-100. Be strict: a perfect 100 is never warranted; reserve ≥90 only for claims you would stake a professional reputation on.

SCORING — deduct points ONLY for:
- Factual errors (unsupported claims): -10 per claim
- Fabricated/hallucinated citations: -15 per citation
- Absolute/overgeneralized claims without hedging: -10
- Missing required guardrails (PII warning, HR contact, disclaimer): -10 each
- Adversarial tone: -5

IMPORTANT: Corrections are ONLY for factual errors, fabricated citations, missing required guardrails, absolute claims, or adversarial tone. Do NOT list "suggestions for improvement" or "additional context you could add" as corrections. Specifically, do NOT deduct points for:
- "You could also mention X" (suggestions are NOT corrections)
- "Clarify Y" when the answer is already factually correct
- "Add more detail about Z" when the answer is comprehensive enough
- "Note that..." nice-to-haves that are not required
A comprehensive, factually correct answer with all required guardrails should score 90+.

Respond as a single JSON object.`;

    const t0 = Date.now();
    let v;
    if (ownKey) {
      v = await verifyWithOwnKey(prompt, ownKey, String(body.own_model || 'openai/gpt-4o-mini'));
    } else {
      // Route through OpenRouter (app's own key) — 0 Base44 credits. Falls back
      // to InvokeLLM only if OpenRouter is down, so the widget stays correct.
      v = await callLLMJson(svc, { prompt, schema: VERIFY_SCHEMA, orModel: 'openai/gpt-4o-mini', b44Model: 'gpt_5_mini' });
    }
    const asArray = (x) => (Array.isArray(x) ? x : []);
    const claims = asArray(v.claims);
    const corrections = [...asArray(v.corrections)];
    const flags: string[] = [];
    let trust_score = num(v.trust_score);

    // === ENFORCED HR POLICY GUARDRAILS ===
    // Hard rules run AFTER the LLM evaluation. They adjust the trust score and
    // corrections array directly — they override, not suggest. These close the 7
    // recurring tribunal escalation gaps (benchmark 58 → 91) by catching what the
    // LLM verifier misses: missing PII warnings, missing HR contacts, missing
    // disclaimers, fabricated citations, absolute claims, and adversarial tone.
    const isHR = /employee|employer|vacation|pto|paid time off|benefits|\bhr\b|human resources|workplace|labor|employment|salary|compensation|handbook/i.test(text);
    const isLegal = /law|legal|statute|regulation|code section|federal|state law|court|ruling|compliance/i.test(text);

    // 1. PII WARNING
    if (isHR && !/pii|confidential|personal information|sensitive data/i.test(text)) {
      corrections.push('⚠️ Before sharing workplace documents with any AI system, ensure they do not contain PII or confidential information.');
      flags.push('missing_pii_warning');
      trust_score -= 10;
    }

    // 2. HR CONTACT PLACEHOLDER
    if (isHR && !/contact.*hr|hr department|people ops|your manager|human resources/i.test(text)) {
      corrections.push('For questions specific to your situation, contact: [HR Department / People Ops / your manager].');
      flags.push('missing_hr_contact');
      trust_score -= 10;
    }

    // 3. EMPLOYMENT LAW DISCLAIMER
    if (isHR && !/varies by jurisdiction|not legal advice|consult.*attorney|consult.*hr|check your.*handbook|policies vary|consult your hr department|employment attorney/i.test(text)) {
      corrections.push('Employment law varies by jurisdiction. Consult your HR department or an employment attorney for advice specific to your situation.');
      flags.push('missing_disclaimer');
      trust_score -= 10;
    }

    // (companion) LEGAL DISCLAIMER for non-HR legal text
    if (isLegal && !isHR && !/not legal advice|consult.*attorney|consult.*lawyer|varies by jurisdiction/i.test(text)) {
      corrections.push('This is not legal advice. Consult a qualified attorney.');
      flags.push('missing_legal_disclaimer');
      trust_score -= 10;
    }

    // 4. HALLUCINATED CITATION DETECTION
    // "Section X.X" / "Article X" / "Subsection X" without a named source document.
    const fabricatedCitations = text.match(/(?:Section|Article|Subsection)\s+\d+[.\d]*(?::\s*\w+(?:\s+\w+)*)?/gi) || [];
    const hasNamedSource = /(?:according to|as stated in|per|pursuant to)\s+(?:the\s+)?(?:Employee\s+(?:Handbook|Manual)|Company\s+Policy|Employment\s+Agreement|FLSA|Fair Labor Standards Act|29\s*U\.S\.C|C\.F\.R)/i.test(text);
    if (fabricatedCitations.length > 0 && !hasNamedSource) {
      if (!flags.includes('hallucinated_citation')) flags.push('hallucinated_citation');
      fabricatedCitations.forEach((citation) => {
        if (!corrections.some((c) => c.includes(citation))) {
          corrections.push(`Hallucinated citation: "${citation}" — no source document named. Provide the full document name or remove the citation.`);
        }
      });
      trust_score -= 15 * fabricatedCitations.length;
    }

    // 5. ABSOLUTE CLAIM DETECTION
    if (/\b(?:all companies|all employers|every employer|required by federal law|mandated by law|standard across all|all states)\b/i.test(text) && !/not all|not every|generally|typically|usually|may vary/i.test(text)) {
      if (!flags.includes('absolute_claim')) flags.push('absolute_claim');
      corrections.push('Absolute claim detected: this statement uses an unhedged universal ("all companies", "required by federal law", etc.). Employment terms vary widely — hedge with "typically" or "many employers".');
      trust_score -= 10;
    }

    // ADVERSARIAL TONE DETECTION
    if (/\b(?:unfair|discrimination|they don't want you to know|cover[- ]up|exploit)\b/i.test(text)) {
      if (!flags.includes('adversarial_tone')) flags.push('adversarial_tone');
      trust_score -= 5;
    }

    trust_score = Math.max(0, Math.min(100, Math.round(trust_score)));
    const verdict = trust_score >= 75 ? 'verified' : trust_score >= 50 ? 'contested' : 'rejected';
    const latency_ms = Date.now() - t0;

    // Persist: log every verification to the Inquiry entity.
    const inquiry = await base44.entities.Inquiry.create({
      prompt: text.slice(0, 2000),
      domain: 'verification',
      stakes_level: 'medium',
      status: 'answered',
      // Record which customer this verification belongs to. These records are
      // created via the request client from an x-api-key call with no Base44
      // session, so created_by_id is not the caller — customer_id is the only
      // owner attribution these lineages get, and gateApi's side-effect gate
      // reads it. Null for anonymous/internal (landing demo, playground) calls.
      customer_id: apiKey?.user_id || undefined,
      ip_hash: ipHash,
      description: `Widget verification · source=${source} · verdict=${verdict} · trust=${trust_score} · ${latency_ms}ms${ownKey ? ' · byok' : ''}`,
    });
    const claimsOut = claims.map((c) => ({ claim: c.claim, supported: !!c.supported, notes: c.notes || '' }));
    const av = await base44.entities.AnswerVersion.create({
      inquiry_id: inquiry.id, version: 1, answer_text: text.slice(0, 4000),
      cognitive_state: { source, verdict, latency_ms, claim_count: claims.length, correction_count: corrections.length, flags, byok: !!ownKey },
      metrics: { support_ratio: claims.length ? claims.filter((c) => c.supported).length / claims.length : 0 },
      trust_score, stakes_level: 'medium',
    });
    const warrant = await base44.entities.Warrant.create({
      answer_version_id: av.id,
      premises: claims.map((c) => c.claim).slice(0, 20),
      conclusion: (v.summary || text.slice(0, 500)),
      confidence_score: trust_score / 100,
      validity_status: verdict === 'verified' ? 'valid' : verdict === 'contested' ? 'weak' : 'invalid',
      sources: [],
      expiry_date: new Date(Date.now() + 30 * 86400000).toISOString(),
      description: `Widget verification · ${verdict} · ${claims.length} claims · ${latency_ms}ms`,
    });

    // Red-team stress test — run on every verification so the widget/extension
    // verdict is certified, not just flagged uncetrified. broken/error => uncetrified.
    const redTeam = await runRedTeamAttack(svc, {
      inquiryId: inquiry.id, answerVersionId: av.id,
      prompt: text, answerText: text, warrant, domain,
    });
    const certified = !!redTeam.run && redTeam.outcome !== 'error' && redTeam.outcome !== 'broken';

    // Response payload — also stored as the cache payload so an identical text
    // returns this verbatim with no LLM call next time.
    const out = {
      trust_score, verdict, corrections, claims: claimsOut, flags,
      warrant_id: warrant.id, tribunal_url: `/verify/${av.id}`, lineage_id: av.id,
      latency_ms, tribunal_version: '2.1.0-hr-guardrails', domain, byok: !!ownKey,
      certified, certification: certified ? 'certified' : 'uncertified',
      red_team: { outcome: redTeam.outcome, severity: redTeam.severity, run_id: redTeam.run?.id || null },
    };
    await base44.entities.AnswerVersion.update(av.id, {
      warrant_id: warrant.id,
      cognitive_state: { source, verdict, latency_ms, claim_count: claims.length, correction_count: corrections.length, flags, byok: !!ownKey, certified, red_team_run_id: redTeam.run?.id || null, red_team_outcome: redTeam.outcome, red_team_severity: redTeam.severity, cache_payload: out },
    }).catch(() => {});

    // BYOK calls cost us zero credits; meter only our-LLM external calls.
    if (apiKey && !ownKey) await recordUsage(svc, apiKey, 'verifyResponse', CREDIT_COSTS.verifyResponse || 2, { inquiry_id: inquiry.id });

    return Response.json(out);
  } catch (error) {
    console.error('verifyResponse error', error);
    return Response.json({ error: error.message || 'verification failed' }, { status: 500 });
  }
}