// Shared red-team attack executor — the default pipeline stage that was
// previously opt-in only. Runs an adversarial attack against a warranted
// answer, persists the RedTeamRun, and returns the outcome. Used by:
//   - inquireTribunal (default stage → marks the lineage "certified")
//   - runSecurityRedTeam (existing manual/admin entry point)
// A tribunal lineage without a completed RedTeamRun is NOT certified.

import { buildRedTeamPrompt, REDTEAM_JSON_SCHEMA } from './sf2xSecurity.js';
import { computeTrustworthyRate } from './sf2xCore.js';
import { callLLMJson } from './llmRouter.js';

export const DEFAULT_ATTACK_VECTOR = 'prompt_injection';

// Run one red-team attack against a warranted answer and persist the result.
// Returns { run, outcome, severity, trust_after, error? }. Never throws — a
// failed attack stage marks the lineage uncertified but does not kill the
// tribunal (the caller decides how to surface that).
export async function runRedTeamAttack(svc, {
  inquiryId, answerVersionId, prompt, answerText, warrant, domain,
  attackVector = DEFAULT_ATTACK_VECTOR, automated = true, orKey = null,
}) {
  try {
    // Route through OpenRouter (app's own key) — 0 Base44 credits. No fallback:
    // if OpenRouter fails, the lineage is uncertified but the app keeps running
    // without burning the credit pool. Red-team is a prompt-injection backstop
    // (pattern-based, not reasoning-heavy) and runs on the cheap tier; the
    // verifier + falsifier carry the epistemic weight.
    const r = await callLLMJson(svc, {
      prompt: buildRedTeamPrompt(attackVector, prompt, answerText, warrant, domain),
      schema: REDTEAM_JSON_SCHEMA,
      orModel: 'openai/gpt-4o-mini',
      allowFallback: false,
      orKey,
    });
    // trust_after reflects the answer's trust AFTER the stress test; a broken
    // outcome is modeled as a trust hit, resisted as unchanged.
    const baseTrust = computeTrustworthyRate({}, warrant);
    let trustAfter = baseTrust;
    if (r.outcome === 'broken') trustAfter = Math.max(0, baseTrust - 25);
    else if (r.outcome === 'wobbled') trustAfter = Math.max(0, baseTrust - 10);

    const run = await svc.entities.RedTeamRun.create({
      target_id: answerVersionId,
      inquiry_id: inquiryId,
      attack_vector: attackVector,
      attack_prompt: r.attack_prompt || '',
      response_text: r.response || '',
      outcome: r.outcome || 'resisted',
      severity: r.severity || 'none',
      trust_after: trustAfter,
      notes: r.notes || '',
    });
    await svc.entities.AuditLog.create({
      event_type: 'drift_alert',
      entity_type: 'RedTeamRun',
      entity_id: run.id,
      summary: `Red-team (${attackVector}) → ${r.outcome} (${r.severity}) for inquiry ${String(inquiryId || '').slice(-6)}`,
      metadata: { outcome: r.outcome, severity: r.severity, inquiry_id: inquiryId, answer_version_id: answerVersionId, automated },
    }).catch(() => {});

    return {
      run, outcome: r.outcome || 'resisted', severity: r.severity || 'none',
      trust_after: trustAfter, attack_vector: attackVector,
    };
  } catch (e) {
    return {
      run: null, outcome: 'error', severity: 'none', trust_after: null,
      attack_vector: attackVector, error: String(e?.message || e),
    };
  }
}

// A lineage is certified only if a completed (non-error) red-team run exists
// against it AND the attack was resisted or wobbled (not broken). Used by the
// public gate API to flag uncertified tribunal runs.
export function isCertifiedRun(answerVersion, redTeamRuns = []) {
  if (!answerVersion) return false;
  // Explicit flag set by the tribunal pipeline takes precedence.
  if (answerVersion.cognitive_state?.certified === true) return true;
  // Otherwise infer from persisted red-team runs against this answer version.
  const completed = (redTeamRuns || []).filter(
    (r) => r.target_id === answerVersion.id && r.outcome && r.outcome !== 'error',
  );
  if (!completed.length) return false;
  // A "broken" run means the answer failed the stress test — not certified.
  return completed.every((r) => r.outcome === 'resisted' || r.outcome === 'wobbled');
}