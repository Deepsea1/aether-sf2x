// Tests for extractionRecall.js — the §6.3 measurement.
//
// "The system is sound only over claims it extracts; a missed material claim
// silently passes everything." The capability card (§18.1) carries
// extraction_recall and the §18.2 gate refuses to unlock without it, so this
// scorer decides whether enforcement can ever be offered. It must not be
// flattering: the threshold, the matching rule, and what counts as a miss are
// all pinned here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreExtractionRecall, coversGold, significantTokens } from '../extractionRecall.js';

// A stub extractor keeps these tests about the SCORER. The real extractor is
// measured by the corpus run, not by unit tests.
const extractorReturning = (...texts) => () => texts.map((t) => ({ text: t }));

test('significant tokens drop stopwords and punctuation, keep numbers WITH their units', () => {
  const t = significantTokens('The API reduces latency by 40% in the EU.');
  // "40%" stays one token on purpose: the unit is part of the claim, and
  // splitting it would let "40 items" cover "40%".
  assert.ok(t.includes('40%'), `expected the quantity to survive intact: ${t.join(',')}`);
  assert.ok(t.includes('latency'));
  assert.ok(!t.includes('the'), 'stopwords must be dropped');
});

test('coversGold is true when an extracted claim contains the gold assertion', () => {
  assert.equal(
    coversGold('Our API reduces latency by 40% under load.', 'API reduces latency by 40%'),
    true,
  );
});

test('coversGold is false when the extracted text omits the load-bearing number', () => {
  // Losing "40%" changes the claim — this must NOT count as recalled.
  assert.equal(coversGold('Our API reduces latency.', 'API reduces latency by 40%'), false);
});

test('coversGold is false for an unrelated sentence', () => {
  assert.equal(coversGold('The office opens at nine.', 'API reduces latency by 40%'), false);
});

test('perfect extraction scores recall 1.0', () => {
  const cases = [{ id: 'c1', text: 'ignored', gold_claims: ['API reduces latency by 40%'] }];
  const r = scoreExtractionRecall(cases, extractorReturning('Our API reduces latency by 40%.'));
  assert.equal(r.recall, 1);
  assert.equal(r.n_gold, 1);
  assert.equal(r.n_recalled, 1);
  assert.deepEqual(r.misses, []);
});

test('a missed claim lowers recall and is reported with its case id', () => {
  const cases = [{
    id: 'c1',
    text: 'ignored',
    gold_claims: ['API reduces latency by 40%', 'the service is SOC 2 compliant'],
  }];
  const r = scoreExtractionRecall(cases, extractorReturning('Our API reduces latency by 40%.'));
  assert.equal(r.n_gold, 2);
  assert.equal(r.n_recalled, 1);
  assert.equal(r.recall, 0.5);
  assert.equal(r.misses.length, 1);
  assert.equal(r.misses[0].case_id, 'c1');
  assert.ok(r.misses[0].gold.includes('SOC 2'));
});

test('extracting NOTHING scores 0, never divide-by-zero or 1.0', () => {
  const cases = [{ id: 'c1', text: 'ignored', gold_claims: ['API reduces latency by 40%'] }];
  const r = scoreExtractionRecall(cases, () => []);
  assert.equal(r.recall, 0);
  assert.equal(r.n_recalled, 0);
});

test('an empty corpus reports null recall — not 1.0', () => {
  // Nothing measured must never read as perfect: null is what the capability
  // card treats as "not measured" and fails closed on.
  const r = scoreExtractionRecall([], extractorReturning('anything'));
  assert.equal(r.recall, null);
  assert.equal(r.n_gold, 0);
});

test('two gold claims sharing ONE extracted sentence are both covered but not distinct', () => {
  // The compound case §6.3 names explicitly. Coverage recall says the text was
  // captured; distinct_unit_rate says the two claims will NOT get independent
  // verdicts — a false claim can ride along with a true one.
  const cases = [{
    id: 'compound',
    text: 'ignored',
    gold_claims: ['the API is SOC 2 compliant', 'the API is HIPAA compliant'],
  }];
  const r = scoreExtractionRecall(
    cases,
    extractorReturning('The API is SOC 2 compliant and the API is HIPAA compliant.'),
  );
  assert.equal(r.recall, 1, 'both assertions are present in the extracted text');
  assert.equal(r.distinct_unit_rate, 0, 'but neither gets its own verification unit');
  assert.equal(r.n_shared_unit, 2);
});

test('distinct_unit_rate is 1.0 when every gold claim gets its own extracted unit', () => {
  const cases = [{
    id: 'c1',
    text: 'ignored',
    gold_claims: ['API reduces latency by 40%', 'the service is SOC 2 compliant'],
  }];
  const r = scoreExtractionRecall(
    cases,
    extractorReturning('Our API reduces latency by 40%.', 'The service is SOC 2 compliant.'),
  );
  assert.equal(r.recall, 1);
  assert.equal(r.distinct_unit_rate, 1);
});

test('recall is rounded to 4 places and never exceeds 1', () => {
  const cases = [{ id: 'c1', text: 'x', gold_claims: ['a b c', 'd e f', 'g h i'] }];
  const r = scoreExtractionRecall(cases, extractorReturning('a b c'));
  assert.ok(r.recall <= 1 && r.recall >= 0);
  assert.equal(r.recall, 0.3333);
});

test('malformed cases are skipped rather than throwing or inflating the score', () => {
  const cases = [
    null,
    { id: 'no-gold' },
    { id: 'empty-gold', gold_claims: [] },
    { id: 'good', text: 'x', gold_claims: ['API reduces latency by 40%'] },
  ];
  const r = scoreExtractionRecall(cases, extractorReturning('Our API reduces latency by 40%.'));
  assert.equal(r.n_gold, 1, 'only the well-formed gold claim counts');
  assert.equal(r.recall, 1);
});
