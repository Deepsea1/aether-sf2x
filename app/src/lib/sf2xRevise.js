import { base44 } from '@/api/base44Client';
import { buildThinkPrompt, THINK_JSON_SCHEMA, generateSignature, computeTrustworthyRate } from './sf2x';
import { gateDecision } from './sf2xPolicy';
import { computeDrift, correctionSeverity, driftLabel } from './sf2xGovernance';

// Shared, UI-free regeneration pipeline used by both the Console (Revise) and
// the governance review queue (Re-run fix action).
export async function regenerateAnswer(inquiry, opts = {}) {
  const priorVersions = await base44.entities.AnswerVersion.filter({ inquiry_id: inquiry.id }, 'version', 50);
  const prev = priorVersions[priorVersions.length - 1];
  let prevWarrant = null;
  if (prev?.warrant_id) prevWarrant = await base44.entities.Warrant.get(prev.warrant_id).catch(() => null);

  let prompt = buildThinkPrompt(inquiry.prompt, inquiry.domain, inquiry.stakes_level);
  // Apply the suggested fix: stronger retrieval + restate the premises. Used by the
  // governance Re-run / Verify-repair actions so the repair loop closes automatically.
  if (opts.forceRetrieval) {
    const prior = (Array.isArray(opts.priorPremises) ? opts.priorPremises : [])
      .map((p, i) => `  ${i + 1}. ${p}`).join('\n') || '  (none recorded)';
    prompt += `\n\nREPAIR DIRECTIVE — a prior version of this answer was flagged for review.\nFix: ${opts.fixText || 'Re-run with stronger retrieval and restate the premises.'}\nPrior premises to restate and re-validate:\n${prior}\nGround every claim in verifiable web evidence, explicitly restate the premises, and produce a well-supported answer with a VALID warrant. Do not repeat the prior error.`;
  }
  const llmParams = { prompt, response_json_schema: THINK_JSON_SCHEMA };
  if (inquiry.stakes_level === 'critical' || opts.forceRetrieval) {
    llmParams.add_context_from_internet = true;
    llmParams.model = opts.forceRetrieval ? 'gemini_3_1_pro' : 'gemini_3_flash';
  }
  const res = await base44.integrations.Core.InvokeLLM(llmParams);
  const r = res && res.data ? res.data : res;
  const w = r.warrant || {};

  const version = (prev ? prev.version : 0) + 1;
  const av = await base44.entities.AnswerVersion.create({
    inquiry_id: inquiry.id, version,
    answer_text: r.answer || '', cognitive_state: r.cognitive_state || {}, metrics: r.metrics || {},
    trust_score: computeTrustworthyRate(r.metrics, w),
  });
  const expiryDays = w.expiry_days || 30;
  const warrant = await base44.entities.Warrant.create({
    answer_version_id: av.id, premises: w.premises || [], conclusion: w.conclusion || '',
    confidence_score: w.confidence_score ?? 0, validity_status: w.validity_status || 'valid',
    sources: w.sources || [], expiry_date: new Date(Date.now() + expiryDays * 86400000).toISOString(),
    signed_hash: generateSignature(av.id),
  });
  await base44.entities.AnswerVersion.update(av.id, { warrant_id: warrant.id });

  const gate = gateDecision(inquiry.stakes_level, r.metrics, warrant);
  let review = null;
  if (gate.createReview) {
    review = await base44.entities.Review.create({
      answer_version_id: av.id, inquiry_id: inquiry.id, capability_level: gate.cap.key,
      status: gate.killSwitch ? 'killed' : 'pending',
    }).catch(() => null);
    await base44.entities.AuditLog.create({
      event_type: gate.killSwitch ? 'kill_switch' : 'gate_decision', entity_type: 'AnswerVersion', entity_id: av.id,
      summary: gate.killSwitch ? `Answer v${version} suppressed (kill-switch) at ${gate.cap.key} · trust ${gate.trust}` : `Answer v${version} routed to human review at ${gate.cap.key} · trust ${gate.trust}`,
      metadata: { capability: gate.cap.key, trust: gate.trust, review_id: review?.id },
    }).catch(() => {});
  }

  let correction = null;
  if (prev) {
    const oldTrust = computeTrustworthyRate(prev.metrics, prevWarrant);
    const drift = computeDrift({ cognitive_state: prev.cognitive_state, warrant: prevWarrant }, { cognitive_state: r.cognitive_state, warrant });
    const severity = correctionSeverity(gate.trust - oldTrust, drift.composite);
    const ttc = Math.max(1, Math.round((new Date(av.created_date).getTime() - new Date(prev.created_date).getTime()) / 1000));
    correction = await base44.entities.CorrectionEvent.create({
      inquiry_id: inquiry.id, from_version_id: prev.id, to_version_id: av.id,
      from_version: prev.version, to_version: version, severity, detected_by: 'self',
      time_to_correction: ttc, trust_delta: gate.trust - oldTrust, drift_score: drift.composite,
      notes: driftLabel(drift.composite).label,
    });
    await base44.entities.AuditLog.create({
      event_type: 'correction_logged', entity_type: 'AnswerVersion', entity_id: av.id,
      summary: `v${prev.version} → v${version} corrected (${severity}, MTTC ${ttc}s)`,
      metadata: { severity, ttc, drift: drift.composite },
    }).catch(() => {});
  }
  await base44.entities.AuditLog.create({
    event_type: 'answer_promoted', entity_type: 'AnswerVersion', entity_id: av.id,
    summary: `Answer v${version} ${gate.killSwitch ? 'generated' : 'promoted'} at ${gate.cap.key} (${gate.cap.label}) · trust ${gate.trust}`,
    metadata: { capability: gate.cap.key, trust: gate.trust, stakes: inquiry.stakes_level },
  }).catch(() => {});

  return { version: { ...av, warrant_id: warrant.id }, warrant, correction, gate, review };
}