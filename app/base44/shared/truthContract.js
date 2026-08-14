// Canonical Aether truth-decision contract (Truth Layer §6-§7).
//
// This module is deliberately pure and portable: Base44 functions, the MCP
// worker, SDKs, and SF2X federation adapters can all use the exact same
// vocabulary without sharing a database or delegating authority to one another.

export const TRUTH_DECISION_SCHEMA = 'aether.truth-decision.v1';

export const TRUTH_STATUSES = Object.freeze([
  'UNEXAMINED', 'VERIFIED', 'CALCULATED', 'INFERRED', 'OPINION',
  'CONTESTED', 'STALE', 'UNKNOWN', 'INSUFFICIENT_EVIDENCE', 'REFUTED', 'SUPERSEDED',
]);

export const PROOF_LEVELS = Object.freeze(['L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8']);

export const EVIDENCE_BASES = Object.freeze([
  'UNEXAMINED', 'MODEL_ASSESSED', 'CITATION_SUPPLIED', 'SOURCE_RETRIEVED',
  'APPLICABLE_ENTAILING_EVIDENCE', 'INDEPENDENT_CORROBORATION',
  'DETERMINISTIC_INPUTS', 'DIRECT_MEASUREMENT', 'ADVERSARIALLY_CHECKED', 'OUTCOME_CONFIRMED',
]);

export const INTEGRITY_STATUSES = Object.freeze([
  'UNSEALED', 'HASHED', 'SIGNED', 'VERIFIED', 'REVOKED', 'COMPROMISED', 'UNAVAILABLE',
]);

export const ACTION_AUTHORIZATIONS = Object.freeze([
  'NOT_AUTHORIZED', 'HUMAN_CONFIRMATION_REQUIRED', 'AUTHORIZED', 'DENIED', 'EXPIRED',
]);

const allowed = (values, value, fallback) => values.includes(value) ? value : fallback;
const evidenceForVerified = new Set(['APPLICABLE_ENTAILING_EVIDENCE', 'INDEPENDENT_CORROBORATION', 'ADVERSARIALLY_CHECKED', 'OUTCOME_CONFIRMED']);

function normalizedProofLevel(value) {
  if (Number.isInteger(value) && value >= 0 && value <= 8) return `L${value}`;
  return allowed(PROOF_LEVELS, value, 'L0');
}

// Construct an output that always exposes all five epistemic dimensions. The
// Truth Gate may set factual status only when the supplied evidence meets its
// minimum; this constructor never upgrades an LLM score into factual proof.
export function createTruthDecision(input = {}) {
  const violations = [];
  let truth_status = allowed(TRUTH_STATUSES, input.truth_status, 'UNKNOWN');
  let evidence_basis = allowed(EVIDENCE_BASES, input.evidence_basis, 'UNEXAMINED');
  let proof_level = normalizedProofLevel(input.proof_level);
  const integrity_status = allowed(INTEGRITY_STATUSES, input.integrity_status, 'UNSEALED');
  const action_authorization = allowed(ACTION_AUTHORIZATIONS, input.action_authorization, 'NOT_AUTHORIZED');

  // A model may propose classifications and research plans, but it cannot award
  // a final factual status. Model-only output is therefore explicitly UNKNOWN L1.
  if (evidence_basis === 'MODEL_ASSESSED') {
    if (truth_status !== 'UNKNOWN' || proof_level !== 'L1') violations.push('model_assessed_output_cannot_award_factual_status');
    truth_status = 'UNKNOWN';
    proof_level = 'L1';
  }

  // VERIFIED means evidence both entails and applies to the scoped claim.
  if (truth_status === 'VERIFIED' && (!evidenceForVerified.has(evidence_basis) || Number(proof_level.slice(1)) < 4)) {
    violations.push('verified_requires_applicable_entailing_evidence_at_l4_or_higher');
    truth_status = 'UNKNOWN';
  }

  // Revoked or compromised integrity does not rewrite the factual state, but it
  // does prevent the resulting record from authorizing downstream action.
  const effective_authorization = ['REVOKED', 'COMPROMISED', 'UNAVAILABLE'].includes(integrity_status)
    ? 'NOT_AUTHORIZED'
    : action_authorization;
  if (effective_authorization !== action_authorization) violations.push('integrity_failure_blocks_action_authorization');

  return {
    schema: TRUTH_DECISION_SCHEMA,
    claim_id: String(input.claim_id ?? ''),
    truth_status,
    evidence_basis,
    proof_level,
    integrity_status,
    action_authorization: effective_authorization,
    policy_id: String(input.policy_id ?? 'unresolved-policy'),
    policy_version: String(input.policy_version ?? 'unresolved'),
    satisfied_rules: Array.isArray(input.satisfied_rules) ? input.satisfied_rules.map(String) : [],
    failed_rules: Array.isArray(input.failed_rules) ? input.failed_rules.map(String) : [],
    missing_evidence: Array.isArray(input.missing_evidence) ? input.missing_evidence.map(String) : [],
    contradicting_evidence_ids: Array.isArray(input.contradicting_evidence_ids) ? input.contradicting_evidence_ids.map(String) : [],
    violations,
  };
}

export function modelAssessedDecision(input = {}) {
  return createTruthDecision({
    ...input,
    truth_status: 'UNKNOWN',
    evidence_basis: 'MODEL_ASSESSED',
    proof_level: 'L1',
    action_authorization: 'NOT_AUTHORIZED',
  });
}

// Response adapters expose the five dimensions at stable top-level keys while
// retaining the full versioned record for consumers that need rule details.
export function exposeTruthDecision(decision) {
  const d = createTruthDecision(decision);
  return {
    truth_decision: d,
    truth_status: d.truth_status,
    evidence_basis: d.evidence_basis,
    proof_level: d.proof_level,
    integrity_status: d.integrity_status,
    action_authorization: d.action_authorization,
  };
}
