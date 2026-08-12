// Characterization tests for capabilityCard.js (MASTER_PLAN v5 §18) — locks
// the symmetric gate: enforcement unlocks only on MEASURED false-block rates
// under threshold plus measured extraction recall; null fails closed; every
// failing reason is listed; and card generation never fabricates a number.
import test from 'node:test';
import assert from 'node:assert/strict';
import { RISK_TIERS, getActiveCard, enforcingAllowed, generateCardData } from '../capabilityCard.js';

const FUTURE = new Date(Date.now() + 86400000).toISOString();
const PAST = new Date(Date.now() - 86400000).toISOString();

const measuredCard = (over = {}) => ({
  domain_pack_id: 'technical-docs@1.0',
  verifier_version: 'test',
  false_block_rate_by_risk: { low: 0.01, moderate: 0.02, high: 0.10, critical: 0.05 },
  false_pass_rate_by_risk: { low: 0, moderate: 0, high: 0, critical: 0 },
  extraction_recall: 0.9,
  valid_from: PAST,
  reviewed_at: PAST,
  expires_at: FUTURE,
  ...over,
});

// ── enforcingAllowed (§18.2) ─────────────────────────────────────────────────

test('no card → locked, with the no-card reason', () => {
  const out = enforcingAllowed(null);
  assert.equal(out.allowed, false);
  assert.ok(out.reasons[0].includes('no active capability card'));
});

test('measured at exactly the thresholds (high 0.10, critical 0.05) unlocks', () => {
  const out = enforcingAllowed(measuredCard());
  assert.deepEqual(out, { allowed: true, reasons: [] });
});

test('one basis point over the high threshold locks, naming the excess', () => {
  const out = enforcingAllowed(measuredCard({ false_block_rate_by_risk: { high: 0.101, critical: 0.05 } }));
  assert.equal(out.allowed, false);
  assert.ok(out.reasons.some((r) => r.includes('exceeds')));
});

test('null rates fail closed as NOT MEASURED — absence is never zero', () => {
  const out = enforcingAllowed(measuredCard({
    false_block_rate_by_risk: { low: null, moderate: null, high: null, critical: null },
  }));
  assert.equal(out.allowed, false);
  assert.ok(out.reasons.some((r) => r.includes('high is not measured')));
  assert.ok(out.reasons.some((r) => r.includes('critical is not measured')));
});

test('unmeasured extraction recall locks even with clean false-block rates', () => {
  const out = enforcingAllowed(measuredCard({ extraction_recall: null }));
  assert.equal(out.allowed, false);
  assert.ok(out.reasons.some((r) => r.includes('extraction_recall')));
});

test('expired card lists EVERY failing reason, not just the first wall', () => {
  const out = enforcingAllowed(measuredCard({
    expires_at: PAST,
    extraction_recall: null,
    false_block_rate_by_risk: { high: 0.5, critical: null },
  }));
  assert.equal(out.allowed, false);
  assert.ok(out.reasons.length >= 3, `want >= 3 reasons, got: ${out.reasons.join(' | ')}`);
});

// ── getActiveCard ────────────────────────────────────────────────────────────

const svcWithCards = (cards, { fail = false } = {}) => ({
  entities: {
    CapabilityCard: {
      filter: async () => { if (fail) throw new Error('db down'); return cards; },
      // generateCardData reads CorrelationAudit; give it an empty default.
    },
    CorrelationAudit: { list: async () => [] },
  },
});

test('newest reviewed_at among ACTIVE cards wins', async () => {
  const older = measuredCard({ reviewed_at: '2026-01-01T00:00:00Z', verifier_version: 'old' });
  const newer = measuredCard({ reviewed_at: '2026-06-01T00:00:00Z', verifier_version: 'new' });
  const card = await getActiveCard(svcWithCards([older, newer]), 'technical-docs@1.0');
  assert.equal(card.verifier_version, 'new');
});

test('expired and not-yet-valid cards are not active; unparseable windows fail closed', async () => {
  const expired = measuredCard({ expires_at: PAST });
  const notYet = measuredCard({ valid_from: FUTURE });
  const garbage = measuredCard({ valid_from: 'not-a-date' });
  assert.equal(await getActiveCard(svcWithCards([expired, notYet, garbage]), 'technical-docs@1.0'), null);
});

test('read failure or blank pack id → null, never a throw', async () => {
  assert.equal(await getActiveCard(svcWithCards([], { fail: true }), 'x'), null);
  assert.equal(await getActiveCard(svcWithCards([measuredCard()]), ''), null);
});

// ── generateCardData ─────────────────────────────────────────────────────────

const svcWithAudits = (rows) => ({
  entities: { CorrelationAudit: { list: async () => rows } },
});

test('no stored negative-control run → every rate null on both cards', async () => {
  const [general, docs] = await generateCardData(svcWithAudits([]));
  for (const tier of RISK_TIERS) {
    assert.equal(general.false_pass_rate_by_risk[tier], null);
    assert.equal(general.false_block_rate_by_risk[tier], null);
    assert.equal(docs.false_block_rate_by_risk[tier], null);
  }
  assert.equal(general.extraction_recall, null);
  assert.equal(enforcingAllowed(docs).allowed, false, 'technical-docs card must fail the gate while unmeasured');
});

test('a run whose items carry errors is NOT a measurement — rates stay null', async () => {
  // The live case (2026-08-12): a gate-2 run executed while Base44 integration
  // credits were exhausted. Every TRUE claim errored with "You have reached the
  // limit of integrations for this month", so all 10 came back caught:false.
  // Measured naively that reads as a 100% false-block rate — which would be a
  // measurement of an outage, not of the verifier. Absent measurement is null.
  const brokenRun = {
    id: 'broken1',
    dataset: 'negctl-v1',
    items: [
      { class: 'TRUE', caught: false, error: 'You have reached the limit of integrations for this month' },
      { class: 'TRUE', caught: false, error: 'You have reached the limit of integrations for this month' },
      { class: 'FABRICATED', caught: true },
    ],
  };
  const [general] = await generateCardData(svcWithAudits([brokenRun]));
  assert.equal(general.false_block_rate_by_risk.high, null, 'an errored run must not produce a false-block rate');
  assert.equal(general.false_pass_rate_by_risk.high, null);
  assert.deepEqual(general.benchmark_refs, []);
  assert.ok(
    general.known_limitations.some((l) => /error|outage|incomplete/i.test(l)),
    `limitations must say why nothing was measured: ${general.known_limitations.join(' | ')}`,
  );
});

test('a clean run is still preferred over a newer errored one', async () => {
  const cleanRun = {
    id: 'clean1',
    dataset: 'negctl-v1',
    items: [
      { class: 'TRUE', caught: true },
      { class: 'FABRICATED', caught: true },
    ],
  };
  const brokenRun = {
    id: 'broken2',
    dataset: 'negctl-v1',
    items: [{ class: 'TRUE', caught: false, error: 'integration limit' }],
  };
  // list() returns newest-first, so the errored run is seen first and skipped.
  const [general] = await generateCardData(svcWithAudits([brokenRun, cleanRun]));
  assert.equal(general.false_block_rate_by_risk.high, 0);
  assert.deepEqual(general.benchmark_refs, ['clean1']);
});

test('rates computed from the latest class-labeled run; unlabeled rows never qualify', async () => {
  const negRun = {
    id: 'run1',
    dataset: 'negctl-v1',
    items: [
      { class: 'FABRICATED', caught: true },
      { class: 'FABRICATED', caught: false },   // missed negative → false pass
      { class: 'CORRUPTED', caught: true },
      { class: 'TRUE', caught: true },
      { class: 'TRUE' },                        // unlabeled true → counts as blocked (against us)
      { class: 'THIN_NEG', caught: true },      // excluded from both proxies
    ],
  };
  const correlationStyleRow = { id: 'run0', items: [{ claim: 'x', trust: 90 }] }; // no class labels
  const [general] = await generateCardData(svcWithAudits([correlationStyleRow, negRun]));
  // false pass: 1 of 3 fabricated/corrupted passed → 0.3333
  assert.equal(general.false_pass_rate_by_risk.high, 0.3333);
  // false block: 1 of 2 true claims failed → 0.5
  assert.equal(general.false_block_rate_by_risk.high, 0.5);
  assert.deepEqual(general.benchmark_refs, ['run1']);
  // measurement gaps make the card worse, never better — stated in limitations
  assert.ok(general.known_limitations.some((l) => l.includes('n=6')));
});
