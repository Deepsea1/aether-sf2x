// Characterization tests for displayEligibility.js (MASTER_PLAN v5 §20) —
// locks the fail-closed display rail: all four checks must pass, doubt never
// earns display, and malformed input never throws.
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkEligibility, ELIGIBLE_VALIDITY_STATUS } from '../displayEligibility.js';

const HASH = 'a'.repeat(64);
const FUTURE = new Date(Date.now() + 86400000).toISOString();
const PAST = new Date(Date.now() - 86400000).toISOString();

const goodWarrant = () => ({
  answer_text_sha256: HASH,
  validity_status: 'valid',
  expiry_date: FUTURE,
});

test('all four checks green → eligible', () => {
  const v = checkEligibility({ warrant: goodWarrant(), content_sha256: HASH });
  assert.equal(v.eligible, true);
  assert.deepEqual(v.reasons, []);
  assert.deepEqual(v.checked, { content_hash_match: true, status_active: true, not_expired: true, v2_bound: true });
});

test('pre-v2 warrant (no content binding) is never eligible', () => {
  const w = goodWarrant();
  delete w.answer_text_sha256;
  const v = checkEligibility({ warrant: w, content_sha256: HASH });
  assert.equal(v.eligible, false);
  assert.equal(v.checked.v2_bound, false);
  assert.ok(v.reasons.some((r) => r.includes('no content binding')));
});

test('hash mismatch detaches the warrant from the displayed text', () => {
  const v = checkEligibility({ warrant: goodWarrant(), content_sha256: 'b'.repeat(64) });
  assert.equal(v.eligible, false);
  assert.equal(v.checked.content_hash_match, false);
});

test('every non-valid status fails — doubt never earns display', () => {
  for (const status of ['weak', 'invalid', 'insufficient_evidence', 'contested', 'expired', undefined]) {
    const w = goodWarrant();
    w.validity_status = status;
    const v = checkEligibility({ warrant: w, content_sha256: HASH });
    assert.equal(v.eligible, false, `status '${status}' must not be eligible`);
    assert.equal(v.checked.status_active, false);
  }
  assert.equal(ELIGIBLE_VALIDITY_STATUS, 'valid');
});

test('past expiry fails; missing expiry reads as expired (fail closed)', () => {
  const past = goodWarrant();
  past.expiry_date = PAST;
  assert.equal(checkEligibility({ warrant: past, content_sha256: HASH }).eligible, false);

  const none = goodWarrant();
  delete none.expiry_date;
  const v = checkEligibility({ warrant: none, content_sha256: HASH });
  assert.equal(v.eligible, false);
  assert.ok(v.reasons.some((r) => r.includes('expiry_date')));
});

test('a warrant expiring exactly now is expired, not fresh', () => {
  const w = goodWarrant();
  const t = Date.parse(w.expiry_date);
  const v = checkEligibility({ warrant: w, content_sha256: HASH, now: () => t });
  assert.equal(v.checked.not_expired, false);
});

test('injectable clock: same warrant, different clocks, different verdicts', () => {
  const w = goodWarrant();
  const before = Date.parse(w.expiry_date) - 1000;
  const after = Date.parse(w.expiry_date) + 1000;
  assert.equal(checkEligibility({ warrant: w, content_sha256: HASH, now: () => before }).eligible, true);
  assert.equal(checkEligibility({ warrant: w, content_sha256: HASH, now: () => after }).eligible, false);
});

test('garbage input never throws, never grants eligibility', () => {
  for (const args of [undefined, {}, { warrant: null }, { warrant: 'x' }, { warrant: {}, content_sha256: 42 }]) {
    const v = checkEligibility(args);
    assert.equal(v.eligible, false);
    assert.ok(Array.isArray(v.reasons) && v.reasons.length > 0);
  }
});
