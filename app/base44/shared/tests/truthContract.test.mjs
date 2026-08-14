import test from 'node:test';
import assert from 'node:assert/strict';
import { createTruthDecision, modelAssessedDecision, exposeTruthDecision, TRUTH_DECISION_SCHEMA } from '../truthContract.js';

test('model-only assessment remains UNKNOWN at L1 and cannot authorize action', () => {
  const out = modelAssessedDecision({ claim_id: 'c1', policy_id: 'general-v1', policy_version: '1' });
  assert.equal(out.schema, TRUTH_DECISION_SCHEMA);
  assert.equal(out.truth_status, 'UNKNOWN');
  assert.equal(out.evidence_basis, 'MODEL_ASSESSED');
  assert.equal(out.proof_level, 'L1');
  assert.equal(out.action_authorization, 'NOT_AUTHORIZED');
});

test('an attempted model-only VERIFIED result is downgraded and recorded as a violation', () => {
  const out = createTruthDecision({ truth_status: 'VERIFIED', evidence_basis: 'MODEL_ASSESSED', proof_level: 'L8' });
  assert.equal(out.truth_status, 'UNKNOWN');
  assert.equal(out.proof_level, 'L1');
  assert.ok(out.violations.includes('model_assessed_output_cannot_award_factual_status'));
});

test('VERIFIED requires applicable entailing evidence at L4 or higher', () => {
  const out = createTruthDecision({ truth_status: 'VERIFIED', evidence_basis: 'SOURCE_RETRIEVED', proof_level: 'L3' });
  assert.equal(out.truth_status, 'UNKNOWN');
  assert.ok(out.violations.includes('verified_requires_applicable_entailing_evidence_at_l4_or_higher'));
});

test('verified claim and action authorization remain separate dimensions', () => {
  const out = createTruthDecision({
    truth_status: 'VERIFIED', evidence_basis: 'APPLICABLE_ENTAILING_EVIDENCE', proof_level: 'L4',
  });
  assert.equal(out.truth_status, 'VERIFIED');
  assert.equal(out.action_authorization, 'NOT_AUTHORIZED');
});

test('integrity failure blocks authorization without rewriting factual status', () => {
  const out = createTruthDecision({
    truth_status: 'VERIFIED', evidence_basis: 'INDEPENDENT_CORROBORATION', proof_level: 5,
    integrity_status: 'REVOKED', action_authorization: 'AUTHORIZED',
  });
  assert.equal(out.truth_status, 'VERIFIED');
  assert.equal(out.proof_level, 'L5');
  assert.equal(out.action_authorization, 'NOT_AUTHORIZED');
  assert.ok(out.violations.includes('integrity_failure_blocks_action_authorization'));
});

test('response adapter exposes all five dimensions without flattening their meaning', () => {
  const out = exposeTruthDecision(modelAssessedDecision({ claim_id: 'c1' }));
  assert.equal(out.truth_decision.schema, TRUTH_DECISION_SCHEMA);
  assert.equal(out.truth_status, 'UNKNOWN');
  assert.equal(out.evidence_basis, 'MODEL_ASSESSED');
  assert.equal(out.proof_level, 'L1');
  assert.equal(out.integrity_status, 'UNSEALED');
  assert.equal(out.action_authorization, 'NOT_AUTHORIZED');
});
