// Hardened 3-way tribunal inquiry — the Console's "Think" pipeline.
//
// Stakes gating: low  -> single-model answer (cheap).
//               med+ -> full tribunal:
//                 1. 3 models answer independently            (3 calls)
//                 2. each is cross-examined by a different lab (3 calls)
//                 3. each original author reconciles          (3 calls)
//                 4. cross-firm verifier ranks + merges        (1 call, +1 for critical)
//                 5. the hardened answer is attested via the existing
//                    web-grounded verification pipeline (validity/trust/snapshots)
// Every initial answer is persisted to ModelBenchRun so the benchmark captures
// all three model calls — no data is lost. Reconciled answers + critiques are
// preserved as Debate records (the audit trail). Corroboration across the three
// initial answers' sources is recorded on the warrant.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';
import { buildThinkPrompt, THINK_JSON_SCHEMA, computeTrustworthyRate, generateSignature } from '../../shared/sf2xCore.js';
import { runVerification, snapshotSources } from '../../shared/attest.js';
import { runRedTeamAttack } from '../../shared/redTeam.js';
import { recordUserEvent } from '../../shared/userMetrics.js';
import { emitTelemetry, newTraceId } from '../../shared/telemetry.js';
import {
  resolveTrio, resolveDuo, familyOf, modelLabel, pickCritiqueModel, pickVerifiers,
  callAnswerer, callReconcile, callCritique, callVerifier, NATIVE_TO_OR,
  buildCritiquePrompt, buildReconcilePrompt, buildMergePrompt, buildFastMergePrompt, corroboratingSources,
} from '../../shared/sf2xTribunal.js';
import { callOpenRouter } from '../../shared/openrouter.js';
import { callAnthropic, isClaudeModel } from '../../shared/anthropic.js';
import { tribunalCaveat } from '../../shared/caveat.js';
import { persistClaimsAndEvidence } from '../../shared/claimPersistence.js';

const VALID_DOMAINS = ['General', 'Medicine', 'Finance', 'Legal', 'HR', 'Engineering', 'Science'];
const VALID_STAKES = ['low', 'medium', 'high', 'critical'];

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

// OpenRouter → Base44 fallback for the single-model warranted-answer path.
async function _orSingleFallback(svc, prompt, model) {
  const orModel = NATIVE_TO_OR[model] || NATIVE_TO_OR.automatic;
  try { return await callOpenRouter(prompt, orModel); }
  catch (e) {
    const params = { prompt, response_json_schema: THINK_JSON_SCHEMA };
    if (model !== 'automatic') params.model = model;
    const res = await svc.integrations.Core.InvokeLLM(params);
    return res && res.data ? res.data : res;
  }
}

// Single-model path for low stakes — one warranted answer, attested, signed.
async function singleMode(base44, svc, { prompt, domain, stakes, model, traceId, origin, groundingText, groundingDocIds }) {
  const thinkPrompt = buildThinkPrompt(prompt, domain, stakes, groundingText);
  // Web-grounded critical path needs Base44's add_context_from_internet (no OR
  // equivalent) — always uses InvokeLLM. Everything else: OpenRouter first.
  const needsWeb = stakes === 'critical' && (model === 'automatic' || model === 'gemini_3_flash' || model === 'gemini_3_1_pro');
  let r;
  if (needsWeb) {
    const params = { prompt: thinkPrompt, response_json_schema: THINK_JSON_SCHEMA };
    if (model !== 'automatic') params.model = model;
    params.add_context_from_internet = true;
    if (model === 'automatic') params.model = 'gemini_3_flash';
    const res = await svc.integrations.Core.InvokeLLM(params);
    r = res && res.data ? res.data : res;
  } else {
    // 3-tier: Anthropic direct (Claude) → OpenRouter → Base44 InvokeLLM.
    if (isClaudeModel(model)) {
      try { r = await callAnthropic(thinkPrompt, model); }
      catch (e) { r = await _orSingleFallback(svc, thinkPrompt, model); }
    } else {
      r = await _orSingleFallback(svc, thinkPrompt, model);
    }
  }
  const w = r.warrant || {};

  const inquiry = await base44.entities.Inquiry.create({ prompt, domain, stakes_level: stakes, status: 'answered' });
  const existing = await base44.entities.AnswerVersion.filter({ inquiry_id: inquiry.id });
  const version = existing.length + 1;
  const av = await base44.entities.AnswerVersion.create({
    inquiry_id: inquiry.id, version, answer_text: r.answer || '',
    cognitive_state: { ...(r.cognitive_state || {}), model, source: 'console_single' },
    metrics: r.metrics || {}, trust_score: computeTrustworthyRate(r.metrics, w), stakes_level: stakes,
  });
  const expiryDays = w.expiry_days || 30;
  const sourceSnapshots = await snapshotSources(w.sources || []);
  const signedHash = await generateSignature([av.id, w.conclusion || '', (w.premises || []).join(';;')].join('|'), { ed25519PrivateKey: secrets.get('ED25519_PRIVATE_KEY'), hmacKey: secrets.get('sf2x_attestation_key') });
  const warrant = await base44.entities.Warrant.create({
    answer_version_id: av.id, premises: w.premises || [], conclusion: w.conclusion || '',
    confidence_score: w.confidence_score ?? 0, validity_status: w.validity_status || 'valid',
    sources: w.sources || [], source_snapshots: sourceSnapshots,
    expiry_date: new Date(Date.now() + expiryDays * 86400000).toISOString(), signed_hash: signedHash,
  });
  await base44.entities.AnswerVersion.update(av.id, { warrant_id: warrant.id });
  return finish(base44, svc, {
    inquiry, version: { ...av, warrant_id: warrant.id }, warrant,
    candidates: [], tribunal: { mode: 'single', model, label: modelLabel(model), company: familyOf(model), certified: false, red_team: { outcome: 'skipped', reason: 'low-stakes single-model path' } },
    certified: false, certification: 'uncertified',
    traceId, origin,
  });
}

// Persist the final lineage bookkeeping shared by both modes.
async function finish(base44, svc, ctx) {
  const { inquiry, version, warrant, candidates, tribunal, certified, certification, traceId, origin } = ctx;
  await emitTelemetry(svc, {
    trace_id: traceId, event_type: 'provenance_signed', span_type: 'provenance', group: 'provenance',
    linked_entity_type: 'AnswerVersion', linked_entity_id: version.id,
    provenance: { warrant_id: warrant.id, signed_hash: warrant.signed_hash, validity: warrant.validity_status },
    summary: `Warrant signed · ${warrant.validity_status} · trust ${version.trust_score}`,
  }).catch(() => {});
  await recordUserEvent(svc, {
    user_id: version.created_by_id, event_type: 'inquiry',
    trust_score: version.trust_score, verdict: warrant.validity_status,
    domain: inquiry.domain, stakes: inquiry.stakes_level, source: 'console',
    linked_entity_type: 'AnswerVersion', linked_entity_id: version.id,
    metadata: { certified: certified ?? false, mode: tribunal?.mode, grounding_doc_ids: inquiry.grounding_doc_ids || [] },
  });
  return Response.json({
    inquiry, version, warrant,
    candidates,
    tribunal,
    certified: certified ?? false,
    certification: certification || 'uncertified',
    cross_firm_verified: !!tribunal?.cross_firm_verified,
    trustworthy_rate: version.trust_score,
    verifier_caveat: tribunalCaveat({ crossFirmVerified: !!tribunal?.cross_firm_verified }),
    verification_url: origin ? `${origin}/verify/${version.id}` : `/verify/${version.id}`,
  });
}

// 2-model fast tribunal for medium stakes — 2 independent answers + 1 cross-firm
// verifier merge + red-team (~5 calls). ~55% cheaper than the full 3-way tribunal,
// still cross-examined by an independent lab. No critique/reconcile round, so no
// Debate records are written.
async function fastMode(base44, svc, { prompt, domain, stakes, models, traceId, origin, groundingText, groundingDocIds }) {
  const duo = resolveDuo(models);
  const dateStr = new Date().toISOString().slice(0, 10);
  const thinkPrompt = buildThinkPrompt(prompt, domain, stakes, groundingText);

  const settled = await Promise.allSettled(duo.map((m) => callAnswerer(svc, m, thinkPrompt)));
  const initials = duo.map((m, i) => {
    const s = settled[i];
    if (s.status === 'fulfilled') {
      const { r, latency_ms } = s.value;
      return { model: m, label: modelLabel(m), company: familyOf(m), answer: r.answer || '', warrant: r.warrant || {}, metrics: r.metrics || {}, cognitive: r.cognitive_state || {}, trust: computeTrustworthyRate(r.metrics || {}, r.warrant || {}), latency_ms, id: 'm' + i };
    }
    return { model: m, label: modelLabel(m), company: familyOf(m), answer: '', warrant: {}, metrics: {}, cognitive: {}, trust: 0, latency_ms: 0, id: 'm' + i, error: s.reason?.message || 'failed' };
  });
  const answerable = initials.filter((a) => !a.error && a.answer);
  if (!answerable.length) return Response.json({ error: 'Both models failed to answer.' }, { status: 502 });

  for (const a of initials) {
    const rec = await svc.entities.ModelBenchRun.create({
      question: prompt, question_date: dateStr, model: a.model, model_label: a.label,
      answer_text: a.answer, trust_score: a.trust, correctness: null, is_winner: false,
      metrics: a.metrics, warrant_summary: { validity: a.warrant?.validity_status || null, confidence: a.warrant?.confidence_score ?? null, premises: (a.warrant?.premises || []).length, sources: (a.warrant?.sources || []).length },
      latency_ms: a.latency_ms, run_type: 'tribunal', verifier_notes: '', error: a.error || null,
      description: 'Fast tribunal initial · ' + duo.join(','),
    });
    a.bench_id = rec.id;
  }

  const candidates = initials.map((a, i) => ({ id: 'm' + i, model: a.label, phase: 'initial', answer: a.answer }));
  const verifierPool = [...new Set([...pickVerifiers(duo, 3), 'claude_opus_4_8', 'claude_sonnet_4_6', 'gpt_5_4', 'automatic'])];
  let verdict = null, usedVerifier = null;
  for (const vm of verifierPool) {
    try { verdict = await callVerifier(svc, vm, buildFastMergePrompt(prompt, candidates, domain, stakes)); usedVerifier = vm; break; }
    catch (e) { console.error('fast verifier ' + vm + ' failed', e?.message || e); }
  }
  if (!verdict) return Response.json({ error: 'The fast tribunal verifier failed to synthesize an answer.' }, { status: 502 });
  const asArray = (x) => Array.isArray(x) ? x : (typeof x === 'string' && x.trim() ? (() => { try { const p = JSON.parse(x); return Array.isArray(p) ? p : []; } catch { return []; } })() : []);
  verdict = { ...verdict, rankings: asArray(verdict.rankings), winner_ids: asArray(verdict.winner_ids), premises: asArray(verdict.premises), sources: asArray(verdict.sources) };

  const knownIds = new Set(initials.map((a) => a.id));
  const resolveId = (raw) => (raw && knownIds.has(raw) ? raw : initials.find((a) => a.label.toLowerCase() === String(raw || '').toLowerCase())?.id) || null;
  let verdicts = {};
  (verdict.rankings || []).forEach((rk) => { const rid = resolveId(rk.id); if (rid) verdicts[rid] = { correctness: Math.max(0, Math.min(1, num(rk.correctness))), notes: rk.notes || '' }; });
  let winnerIds = (verdict.winner_ids || []).map(resolveId).filter((x) => x && knownIds.has(x));
  if (!winnerIds.length && Object.keys(verdicts).length) {
    const top = Math.max(...Object.values(verdicts).map((v) => v.correctness));
    winnerIds = Object.entries(verdicts).filter(([, v]) => Math.abs(v.correctness - top) <= 0.03).map(([id]) => id);
  }
  for (const a of initials) {
    const v = verdicts[a.id];
    if (v) await svc.entities.ModelBenchRun.update(a.bench_id, { correctness: v.correctness, is_winner: winnerIds.includes(a.id), verifier_notes: v.notes }).catch(() => {});
  }

  const hardenedAnswer = String(verdict.hardened_answer || '').trim() || answerable.sort((a, b) => b.trust - a.trust)[0].answer;
  const premises = Array.isArray(verdict.premises) ? verdict.premises.map(String).filter((x) => x.trim()) : [];
  const sources = Array.isArray(verdict.sources) ? verdict.sources.map(String).filter((x) => x.trim()) : [];
  const ver = await runVerification(svc, { answerText: hardenedAnswer, premises, sources, domain, falsify: true, foreignVendor: false });
  const corroboration = corroboratingSources(initials);
  const metrics = {
    confidence_entropy: 1 - ver.verifierConfidence,
    expected_calibration_error: 1 - ver.verifierConfidence,
    uncorrected_confidence_rate: 1 - ver.supportRatio,
    false_refusal_rate: 0, correction_rate: 0, mean_time_to_correction: 0,
    epistemic_drift_score: 1 - ver.supportRatio,
  };
  const inquiry = await base44.entities.Inquiry.create({ prompt, domain, stakes_level: stakes, status: 'answered' });
  const existing = await base44.entities.AnswerVersion.filter({ inquiry_id: inquiry.id });
  const version = existing.length + 1;
  const av = await base44.entities.AnswerVersion.create({
    inquiry_id: inquiry.id, version, answer_text: hardenedAnswer,
    cognitive_state: { model: 'fast:' + duo.join(','), source: 'console_fast', duo, verifier: [usedVerifier], supported_claims: ver.supported, claim_count: ver.total, falsifier: ver.falsification?.falsification_strength || null },
    metrics, trust_score: ver.trust, stakes_level: stakes,
  });
  const sourceSnapshots = await snapshotSources(sources);
  const warrantPremises = premises.length ? premises : ver.claims.map((c) => c.claim);
  const signedHash = await generateSignature([av.id, hardenedAnswer, warrantPremises.join(';;'), sources.join(';;')].join('|'), { ed25519PrivateKey: secrets.get('ED25519_PRIVATE_KEY'), hmacKey: secrets.get('sf2x_attestation_key') });
  const fastRoles = [
    ...duo.map((m) => ({ role: 'proposer', model_family: familyOf(m), vendor: 'base44' })),
    { role: 'verifier', model_family: familyOf(usedVerifier) || 'base44', vendor: 'base44' },
    ...(ver.falsification ? [{ role: 'falsifier', model_family: ver.falsification.cross_firm ? 'openai' : 'anthropic', vendor: ver.falsification.vendor }] : []),
    { role: 'coverage', model_family: 'anthropic', vendor: 'anthropic-via-openrouter' },
    { role: 'red_team', model_family: 'openai', vendor: 'openai-via-openrouter' },
  ];
  const warrant = await base44.entities.Warrant.create({
    answer_version_id: av.id, premises: warrantPremises,
    conclusion: hardenedAnswer.slice(0, 1000), confidence_score: Math.max(0, Math.min(1, num(verdict.confidence_score) || ver.verifierConfidence)),
    validity_status: ver.validity, sources, source_snapshots: sourceSnapshots, corroboration, claims: ver.claims, issues: ver.issues,
    support_confidence: ver.support_confidence, detectability_confidence: ver.detectability_confidence,
    falsification: ver.falsification, roles: fastRoles,
    expiry_date: new Date(Date.now() + 30 * 86400000).toISOString(), signed_hash: signedHash,
    description: `Fast tribunal warrant · ${ver.supported}/${ver.total} claims · ${ver.validity} · corroborated by ${corroboration.count}/${corroboration.total_models} models · verifier ${usedVerifier}`,
  });
  // Persist discrete Claim + EvidencePack records for claim-level auditability.
  await persistClaimsAndEvidence(svc, {
    ver, warrantId: warrant.id, answerVersionId: av.id,
    tenantId: user.id, domain: inquiry.domain, sources,
  }).catch((e) => console.error('fast claim persistence failed:', e?.message || e));
  const redTeam = await runRedTeamAttack(svc, { inquiryId: inquiry.id, answerVersionId: av.id, prompt, answerText: hardenedAnswer, warrant, domain });
  const certified = !!redTeam.run && redTeam.outcome !== 'error' && redTeam.outcome !== 'broken';
  const resistanceRate = redTeam.outcome === 'resisted' ? 1 : redTeam.outcome === 'wobbled' ? 0.5 : 0;
  await base44.entities.AnswerVersion.update(av.id, {
    warrant_id: warrant.id,
    cognitive_state: { ...av.cognitive_state, certified, red_team_run_id: redTeam.run?.id || null, red_team_outcome: redTeam.outcome, red_team_severity: redTeam.severity },
    metrics: { ...metrics, resistance_rate: resistanceRate },
  }).catch(() => {});
  await base44.entities.AuditLog.create({
    event_type: 'review_decision', entity_type: 'AnswerVersion', entity_id: av.id,
    summary: `Fast tribunal ${certified ? 'certified' : 'UNCERTIFIED'} · red-team ${redTeam.outcome} (${redTeam.severity})`,
    metadata: { certified, red_team_run_id: redTeam.run?.id || null, red_team_outcome: redTeam.outcome, mode: 'fast' },
  }).catch(() => {});

  const candidateOut = initials.map((a) => ({
    id: a.id, model: a.model, label: a.label, company: a.company,
    answer: a.answer, trust: a.trust, correctness: verdicts[a.id]?.correctness ?? null,
    is_winner: winnerIds.includes(a.id), warrant_summary: { validity: a.warrant?.validity_status || null, premises: (a.warrant?.premises || []).length, sources: (a.warrant?.sources || []).length },
    latency_ms: a.latency_ms, verifier_notes: verdicts[a.id]?.notes || '', error: a.error || null,
  }));

  return await finish(base44, svc, {
    inquiry, version: { ...av, warrant_id: warrant.id }, warrant,
    candidates: candidateOut,
    tribunal: { mode: 'fast', duo, verifier: [usedVerifier], consensus: 'agreed', merge_notes: verdict.merge_notes || '', corroboration, certified, cross_firm_verified: !!ver.cross_firm_verified, falsifier: ver.falsification?.falsification_strength || null, red_team: { outcome: redTeam.outcome, severity: redTeam.severity, run_id: redTeam.run?.id || null } },
    certified, certification: certified ? 'certified' : 'uncertified',
    traceId, origin,
  });
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;
    let user = null;
    try { user = await base44.auth.me(); } catch {}
    if (!user) return Response.json({ error: 'Sign in to run the tribunal.' }, { status: 401 });

    if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
    const origin = new URL(req.url).origin;
    const body = await req.json().catch(() => ({}));
    const prompt = (body.prompt || '').toString().trim();
    if (!prompt) return Response.json({ error: 'prompt is required' }, { status: 400 });
    const domain = VALID_DOMAINS.includes(body.domain) ? body.domain : 'General';
    const stakes = VALID_STAKES.includes(body.stakes) ? body.stakes : 'medium';
    const model = body.model || 'automatic';

    // Optional customer grounding documents — when provided, their content is
    // injected into the answer prompt and the association is recorded on the
    // Inquiry so a low-trust result can trigger a grounding-doc review.
    let groundingDocIds = Array.isArray(body.grounding_doc_ids)
      ? body.grounding_doc_ids.map((x) => String(x).trim()).filter(Boolean).slice(0, 6)
      : [];
    let groundingText = '';
    if (groundingDocIds.length) {
      // Use the caller-scoped client so GroundingDoc RLS enforces ownership
      // (admins retain their existing wider access through the entity policy).
      const allDocs = await base44.entities.GroundingDoc.filter({ active: true }).catch(() => []);
      const wanted = new Set(groundingDocIds);
      const selected = (allDocs || []).filter((d) => wanted.has(String(d.id).trim()));
      groundingDocIds = selected.map((d) => d.id);
      groundingText = selected
        .map((d) => `--- ${d.name} (${d.domain || 'general'}) ---\n${String(d.content || '').slice(0, 4000)}`)
        .join('\n\n')
        .slice(0, 16000);
    }

    const traceId = newTraceId();
    await emitTelemetry(svc, {
      trace_id: traceId, event_type: 'request_received', span_type: 'operation', group: 'identity',
      identity: { user_id: user.id, role: user.role, client_type: 'console', auth_state: 'session' },
      prompt: { user_intent_classification: domain, conversation_state: stakes },
      summary: `Console inquiry · ${domain}/${stakes}`,
    }).catch(() => {});

    // Low stakes: cheap single-model path.
    if (stakes === 'low') return await singleMode(base44, svc, { prompt, domain, stakes, model, traceId, origin, groundingText, groundingDocIds });

    // Medium stakes: 2-model fast tribunal (~5 calls) — cheaper, still cross-examined.
    if (stakes === 'medium') return await fastMode(base44, svc, { prompt, domain, stakes, models: body.models, traceId, origin, groundingText, groundingDocIds });

    // === Tribunal (medium / high / critical) ===
    const trio = resolveTrio(body.models);
    const dateStr = new Date().toISOString().slice(0, 10);
    const thinkPrompt = buildThinkPrompt(prompt, domain, stakes, groundingText);

    // 1. Three independent answers (parallel).
    const settled = await Promise.allSettled(trio.map((m) => callAnswerer(svc, m, thinkPrompt)));
    const initials = trio.map((m, i) => {
      const s = settled[i];
      if (s.status === 'fulfilled') {
        const { r, latency_ms } = s.value;
        return { model: m, label: modelLabel(m), company: familyOf(m), answer: r.answer || '', warrant: r.warrant || {}, metrics: r.metrics || {}, cognitive: r.cognitive_state || {}, trust: computeTrustworthyRate(r.metrics || {}, r.warrant || {}), latency_ms, id: 'm' + i };
      }
      return { model: m, label: modelLabel(m), company: familyOf(m), answer: '', warrant: {}, metrics: {}, cognitive: {}, trust: 0, latency_ms: 0, id: 'm' + i, error: s.reason?.message || 'failed' };
    });
    const answerable = initials.filter((a) => !a.error && a.answer);
    if (!answerable.length) return Response.json({ error: 'All three models failed to answer.' }, { status: 502 });

    // Persist every initial answer to the benchmark — no model call is lost.
    const benchRows = [];
    for (const a of initials) {
      const rec = await svc.entities.ModelBenchRun.create({
        question: prompt, question_date: dateStr, model: a.model, model_label: a.label,
        answer_text: a.answer, trust_score: a.trust, correctness: null, is_winner: false,
        metrics: a.metrics, warrant_summary: { validity: a.warrant?.validity_status || null, confidence: a.warrant?.confidence_score ?? null, premises: (a.warrant?.premises || []).length, sources: (a.warrant?.sources || []).length },
        latency_ms: a.latency_ms, run_type: 'tribunal', verifier_notes: '', error: a.error || null,
        description: 'Tribunal initial answer · ' + trio.join(','),
      });
      benchRows.push({ ...a, bench_id: rec.id });
    }

    // 2. Cross-examine each answer by a different lab (parallel).
    const critiques = await Promise.allSettled(initials.map(async (a) => {
      if (a.error || !a.answer) return { restated: '', objections: [], risks: '', verdict: 'contested', text: '' };
      const criticModel = pickCritiqueModel(a.model, trio);
      const { v } = await callCritique(svc, criticModel, buildCritiquePrompt(prompt, a.answer, a.label, domain, stakes));
      return { ...v, criticModel, text: [v.restated, (v.objections || []).join('; '), v.risks].filter(Boolean).join('\n') };
    }));
    const critiqueResults = initials.map((a, i) => critiques[i].status === 'fulfilled' ? critiques[i].value : { restated: '', objections: [], risks: '', verdict: 'contested', text: '', criticModel: null, error: critiques[i].reason?.message });

    // 3. Each original author reconciles with its critique (parallel).
    const reconciled = await Promise.allSettled(initials.map(async (a, i) => {
      const crit = critiqueResults[i];
      if (a.error || !a.answer || !crit.text) return { answer: a.answer, warrant: a.warrant, metrics: a.metrics, cognitive: a.cognitive };
      const { r } = await callReconcile(svc, a.model, buildReconcilePrompt(prompt, a.answer, crit.text, domain, stakes));
      return { answer: r.answer || a.answer, warrant: r.warrant || a.warrant, metrics: r.metrics || a.metrics, cognitive: r.cognitive_state || a.cognitive };
    }));
    const reconcileResults = initials.map((a, i) => reconciled[i].status === 'fulfilled' ? reconciled[i].value : { answer: a.answer, warrant: a.warrant, metrics: a.metrics, cognitive: a.cognitive });

    // 4. Cross-firm verifier ranks the initials + synthesizes the hardened answer.
    const candidates = initials.flatMap((a, i) => [
      { id: 'm' + i, model: a.label, phase: 'initial', answer: a.answer },
      { id: 'r' + i, model: a.label, phase: 'reconciled', answer: reconcileResults[i].answer },
    ]);
    // Cross-firm verifier ranks the initials + synthesizes the hardened answer.
    // Try cross-firm labs first; fall back to any native model so a single
    // deprecated OpenRouter route can never kill the tribunal.
    let consensus = 'agreed';
    const verifierPool = [...new Set([
      ...pickVerifiers(trio, 4),
      'claude_opus_4_8', 'claude_sonnet_4_6', 'gpt_5_4', 'automatic',
    ])];
    let verdict = null;
    let usedVerifier = null;
    for (const vm of verifierPool) {
      try {
        verdict = await callVerifier(svc, vm, buildMergePrompt(prompt, candidates, domain, stakes));
        usedVerifier = vm;
        break;
      } catch (e) { console.error('tribunal verifier ' + vm + ' failed', e?.message || e); }
    }
    let secondVerdict = null;
    let secondVerifier = null;
    if (stakes === 'critical') {
      for (const vm of verifierPool) {
        if (vm === usedVerifier) continue;
        try {
          secondVerdict = await callVerifier(svc, vm, buildMergePrompt(prompt, candidates, domain, stakes));
          secondVerifier = vm;
          break;
        } catch (e) { console.error('tribunal verifier2 ' + vm + ' failed', e?.message || e); }
      }
    }
    if (!verdict) return Response.json({ error: 'The tribunal verifier failed to synthesize an answer.' }, { status: 502 });
    // Coerce the verifier payload to the expected shape (native InvokeLLM can
    // return array fields as strings / objects when a model strays from schema).
    const asArray = (x) => Array.isArray(x) ? x : (typeof x === 'string' && x.trim() ? (() => { try { const p = JSON.parse(x); return Array.isArray(p) ? p : []; } catch { return []; } })() : []);
    const normalizeVerdict = (v) => v && typeof v === 'object' ? {
      ...v,
      rankings: asArray(v.rankings),
      winner_ids: asArray(v.winner_ids),
      premises: asArray(v.premises),
      sources: asArray(v.sources),
    } : v;
    verdict = normalizeVerdict(verdict);
    if (secondVerdict) secondVerdict = normalizeVerdict(secondVerdict);
    const verifierModels = [usedVerifier, secondVerifier].filter(Boolean);

    // Resolve correctness + winner on the initial candidates.
    const knownIds = new Set(initials.map((a) => a.id));
    const resolveId = (raw) => (raw && knownIds.has(raw) ? raw : initials.find((a) => a.label.toLowerCase() === String(raw || '').toLowerCase())?.id) || null;
    let verdicts = {};
    (verdict.rankings || []).forEach((rk) => { const rid = resolveId(rk.id); if (rid) verdicts[rid] = { correctness: Math.max(0, Math.min(1, num(rk.correctness))), notes: rk.notes || '' }; });
    let winnerIds = (verdict.winner_ids || []).map(resolveId).filter((x) => x && knownIds.has(x));
    if (secondVerdict) {
      const v2 = {};
      (secondVerdict.rankings || []).forEach((rk) => { const rid = resolveId(rk.id); if (rid) v2[rid] = Math.max(0, Math.min(1, num(rk.correctness))); });
      // Average correctness; if winners disagree, mark contested.
      const w2 = new Set((secondVerdict.winner_ids || []).map(resolveId).filter((x) => x && knownIds.has(x)));
      for (const id of knownIds) if (v2[id] != null) verdicts[id] = { correctness: (((verdicts[id]?.correctness) ?? 0) + v2[id]) / 2, notes: verdicts[id]?.notes || '' };
      const w1 = new Set(winnerIds);
      const overlap = [...w1].filter((x) => w2.has(x));
      if (!overlap.length && w1.size && w2.size) { consensus = 'contested'; winnerIds = [...w1, ...w2]; }
    }
    if (!winnerIds.length && Object.keys(verdicts).length) {
      const top = Math.max(...Object.values(verdicts).map((v) => v.correctness));
      winnerIds = Object.entries(verdicts).filter(([, v]) => Math.abs(v.correctness - top) <= 0.03).map(([id]) => id);
    }

    // Update benchmark rows with correctness + winner.
    for (const a of initials) {
      const v = verdicts[a.id];
      if (v) await svc.entities.ModelBenchRun.update(a.bench_id, { correctness: v.correctness, is_winner: winnerIds.includes(a.id), verifier_notes: v.notes }).catch(() => {});
    }

    // 5. Attest the hardened answer through the existing web-grounded pipeline.
    const hardenedAnswer = String(verdict.hardened_answer || '').trim() || answerable.sort((a, b) => b.trust - a.trust)[0].answer;
    const premises = Array.isArray(verdict.premises) ? verdict.premises.map(String).filter((x) => x.trim()) : [];
    const sources = Array.isArray(verdict.sources) ? verdict.sources.map(String).filter((x) => x.trim()) : [];
    const ver = await runVerification(svc, { answerText: hardenedAnswer, premises, sources, domain, falsify: true, foreignVendor: stakes === 'critical' });
    const corroboration = corroboratingSources(initials);

    const metrics = {
      confidence_entropy: 1 - ver.verifierConfidence,
      expected_calibration_error: 1 - ver.verifierConfidence,
      uncorrected_confidence_rate: 1 - ver.supportRatio,
      false_refusal_rate: 0, correction_rate: 0, mean_time_to_correction: 0,
      epistemic_drift_score: 1 - ver.supportRatio,
    };
    const inquiry = await base44.entities.Inquiry.create({ prompt, domain, stakes_level: stakes, status: 'answered', grounding_doc_ids: groundingDocIds || [] });
    const existing = await base44.entities.AnswerVersion.filter({ inquiry_id: inquiry.id });
    const version = existing.length + 1;
    const av = await base44.entities.AnswerVersion.create({
      inquiry_id: inquiry.id, version, answer_text: hardenedAnswer,
      cognitive_state: { model: 'tribunal:' + trio.join(','), source: 'console_tribunal', trio, verifier: verifierModels, consensus, merge_notes: verdict.merge_notes || '', supported_claims: ver.supported, claim_count: ver.total, falsifier: ver.falsification?.falsification_strength || null, cross_firm_verified: !!ver.cross_firm_verified },
      metrics, trust_score: ver.trust, stakes_level: stakes,
    });
    const sourceSnapshots = await snapshotSources(sources);
    const warrantPremises = premises.length ? premises : ver.claims.map((c) => c.claim);
    const signedHash = await generateSignature([av.id, hardenedAnswer, warrantPremises.join(';;'), sources.join(';;')].join('|'), { ed25519PrivateKey: secrets.get('ED25519_PRIVATE_KEY'), hmacKey: secrets.get('sf2x_attestation_key') });
    const tribunalRoles = [
      ...trio.map((m) => ({ role: 'proposer', model_family: familyOf(m), vendor: 'base44' })),
      ...trio.map((m) => ({ role: 'critic', model_family: familyOf(pickCritiqueModel(m, trio)), vendor: 'base44' })),
      ...verifierModels.map((m) => ({ role: 'verifier', model_family: familyOf(m) || 'base44', vendor: 'base44' })),
      ...(ver.falsification ? [{ role: 'falsifier', model_family: ver.falsification.cross_firm ? 'openai' : 'anthropic', vendor: ver.falsification.vendor }] : []),
      { role: 'coverage', model_family: 'anthropic', vendor: 'anthropic-via-openrouter' },
      { role: 'red_team', model_family: 'openai', vendor: 'openai-via-openrouter' },
    ];
    const warrant = await base44.entities.Warrant.create({
      answer_version_id: av.id, premises: warrantPremises,
      conclusion: hardenedAnswer.slice(0, 1000), confidence_score: Math.max(0, Math.min(1, num(verdict.confidence_score) || ver.verifierConfidence)),
      validity_status: ver.validity, sources, source_snapshots: sourceSnapshots, corroboration, claims: ver.claims, issues: ver.issues,
      support_confidence: ver.support_confidence, detectability_confidence: ver.detectability_confidence,
      falsification: ver.falsification, roles: tribunalRoles,
      expiry_date: new Date(Date.now() + 30 * 86400000).toISOString(), signed_hash: signedHash,
      description: `Tribunal warrant · ${ver.supported}/${ver.total} claims · ${ver.validity} · corroborated by ${corroboration.count}/${corroboration.total_models} models · verifier ${verifierModels.join('+')} · ${consensus}${ver.cross_firm_verified ? ' · cross-firm' : ''}`,
    });
    // Persist discrete Claim + EvidencePack records for claim-level auditability.
    await persistClaimsAndEvidence(svc, {
      ver, warrantId: warrant.id, answerVersionId: av.id,
      tenantId: user.id, domain: inquiry.domain, sources,
    }).catch((e) => console.error('claim persistence failed:', e?.message || e));
    // 6. Red-team stress test — DEFAULT pipeline stage (not opt-in). The certified
    // run (score 91) included this; dropping it collapsed scores to 41. A tribunal
    // answer that skips or fails this stage is marked uncertified and the public
    // gate API surfaces that flag, so a regression can never silently ship.
    const redTeam = await runRedTeamAttack(svc, {
      inquiryId: inquiry.id, answerVersionId: av.id,
      prompt, answerText: hardenedAnswer, warrant, domain,
    });
    const certified = !!redTeam.run && redTeam.outcome !== 'error' && redTeam.outcome !== 'broken';
    const resistanceRate = redTeam.outcome === 'resisted' ? 1 : redTeam.outcome === 'wobbled' ? 0.5 : 0;
    await base44.entities.AnswerVersion.update(av.id, {
      warrant_id: warrant.id,
      cognitive_state: {
        ...av.cognitive_state,
        certified, red_team_run_id: redTeam.run?.id || null,
        red_team_outcome: redTeam.outcome, red_team_severity: redTeam.severity,
      },
      metrics: { ...metrics, resistance_rate: resistanceRate },
    }).catch(() => {});
    await base44.entities.AuditLog.create({
      event_type: 'review_decision', entity_type: 'AnswerVersion', entity_id: av.id,
      summary: `Tribunal ${certified ? 'certified' : 'UNCCERTIFIED'} · red-team ${redTeam.outcome} (${redTeam.severity})`,
      metadata: { certified, red_team_run_id: redTeam.run?.id || null, red_team_outcome: redTeam.outcome, default_stage: true },
    }).catch(() => {});

    // Preserve the full tribunal trace as Debate records (audit trail) — one per model.
    for (let i = 0; i < initials.length; i++) {
      const a = initials[i];
      const crit = critiqueResults[i];
      const rec = reconcileResults[i];
      await svc.entities.Debate.create({
        inquiry_id: inquiry.id, answer_version_id: av.id,
        proposer: { stance: a.answer, reasoning: (a.cognitive?.reasoning_summary) || '', model: a.model, phase: 'initial', correctness: verdicts[a.id]?.correctness ?? null, winner: winnerIds.includes(a.id) },
        critic: { objections: crit.objections || [], risks: crit.risks || '', verdict: crit.verdict || 'contested', model: crit.criticModel },
        verifier: { verdict: rec.answer ? 'reconciled' : 'unchanged', corrections: (crit.objections || []).slice(0, 5), reconciled_answer: (rec.answer || '').slice(0, 2000), model: a.model },
        consensus: crit.verdict === 'holds' ? 'agreed' : crit.verdict === 'fails' ? 'rejected' : 'contested',
        verdict_confidence: a.warrant?.confidence_score ?? 0,
        minority_report: (crit.text || '').slice(0, 1000),
        description: `Tribunal trace · ${a.label}`,
      }).catch(() => {});
    }

    await svc.entities.AuditLog.create({
      event_type: 'inquiry_created', entity_type: 'Inquiry', entity_id: inquiry.id,
      summary: `Tribunal inquiry · ${domain}/${stakes} · trio ${trio.join(',')} · verifier ${verifierModels.join('+')} · ${consensus}`,
      metadata: { domain, stakes, trio, verifier: verifierModels, consensus, corroboration: corroboration.count },
    }).catch(() => {});

    const candidateOut = initials.map((a) => ({
      id: a.id, model: a.model, label: a.label, company: a.company,
      answer: a.answer, trust: a.trust, correctness: verdicts[a.id]?.correctness ?? null,
      is_winner: winnerIds.includes(a.id), warrant_summary: { validity: a.warrant?.validity_status || null, premises: (a.warrant?.premises || []).length, sources: (a.warrant?.sources || []).length },
      latency_ms: a.latency_ms, verifier_notes: verdicts[a.id]?.notes || '', error: a.error || null,
    }));

    return await finish(base44, svc, {
      inquiry, version: { ...av, warrant_id: warrant.id }, warrant,
      candidates: candidateOut,
      tribunal: { mode: 'tribunal', trio, verifier: verifierModels, consensus, merge_notes: verdict.merge_notes || '', corroboration, critiques: critiqueResults.length, certified, cross_firm_verified: !!ver.cross_firm_verified, falsifier: ver.falsification?.falsification_strength || null, red_team: { outcome: redTeam.outcome, severity: redTeam.severity, run_id: redTeam.run?.id || null } },
      certified,
      certification: certified ? 'certified' : 'uncertified',
      traceId, origin,
    });
  } catch (error) {
    console.error('inquireTribunal error', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}