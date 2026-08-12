// Tests for claimShape.js — the LLM-output normalizer that stands between a
// model's claims array and the Warrant entity's typed premises field.
//
// Why it exists: verifyResponse mapped `claims.map(c => c.claim)` straight into
// Warrant.premises. The VERIFY_SCHEMA asks for `claim: string`, but models
// violate their schema intermittently — and when one returned a non-string,
// Warrant.create rejected the row and the endpoint 500'd on a live public
// request ("Error in field premises.0: Input should be a valid string",
// observed 2026-08-12 via scripts/verify-live.mjs probe E1). A schema request
// is not a guarantee; the boundary has to coerce.
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeClaims, premisesFrom } from '../claimShape.js';

test('well-formed claims pass through unchanged', () => {
  const out = normalizeClaims([{ claim: 'Water boils at 100C.', supported: true, notes: 'physics' }]);
  assert.deepEqual(out, [{ claim: 'Water boils at 100C.', supported: true, notes: 'physics' }]);
});

test('a non-string claim is stringified, never passed through raw', () => {
  // The exact live failure: the model emitted a nested object for `claim`.
  const out = normalizeClaims([{ claim: { text: 'nested' }, supported: true }]);
  assert.equal(typeof out[0].claim, 'string');
  assert.ok(out[0].claim.includes('nested'), 'content must survive stringification');
});

test('numeric and boolean claims become their string forms', () => {
  const out = normalizeClaims([{ claim: 42, supported: true }, { claim: true, supported: false }]);
  assert.deepEqual(out.map((c) => c.claim), ['42', 'true']);
});

test('claims with no recoverable text are dropped, not emitted as empty strings', () => {
  const out = normalizeClaims([
    { claim: '', supported: true },
    { claim: '   ', supported: true },
    { claim: null, supported: true },
    { supported: true },
    { claim: 'real one', supported: true },
  ]);
  assert.deepEqual(out.map((c) => c.claim), ['real one']);
});

test('supported is coerced to a real boolean; notes to a string', () => {
  const out = normalizeClaims([{ claim: 'x', supported: 'yes', notes: 7 }]);
  assert.equal(out[0].supported, true);
  assert.equal(out[0].notes, '7');
  const out2 = normalizeClaims([{ claim: 'x' }]);
  assert.equal(out2[0].supported, false, 'absent support is not support');
  assert.equal(out2[0].notes, '');
});

test('non-object entries are dropped', () => {
  const out = normalizeClaims(['a bare string', null, 42, { claim: 'kept', supported: true }]);
  assert.deepEqual(out.map((c) => c.claim), ['kept']);
});

test('non-array input yields an empty array, never throws', () => {
  for (const bad of [undefined, null, 'claims', 42, {}]) {
    assert.deepEqual(normalizeClaims(bad), []);
  }
});

test('claim text is capped so one runaway claim cannot blow the entity field', () => {
  const out = normalizeClaims([{ claim: 'x'.repeat(5000), supported: true }]);
  assert.ok(out[0].claim.length <= 2000, `claim length ${out[0].claim.length} must be capped`);
});

// ── premisesFrom: the Warrant.premises projection ────────────────────────────

test('premisesFrom yields only strings, capped at 20', () => {
  const claims = Array.from({ length: 30 }, (_, i) => ({ claim: `claim ${i}`, supported: true }));
  const premises = premisesFrom(normalizeClaims(claims));
  assert.equal(premises.length, 20);
  assert.ok(premises.every((p) => typeof p === 'string'));
});

test('premisesFrom on garbage input is an empty array — the entity write stays valid', () => {
  const premises = premisesFrom(normalizeClaims([{ claim: {} }, { claim: null }]));
  assert.deepEqual(premises, []);
  assert.ok(premises.every((p) => typeof p === 'string'));
});
