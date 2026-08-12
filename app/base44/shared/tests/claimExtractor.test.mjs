// Regression tests for claimExtractor.js — pinning the specific defects that
// the §6.3 extraction-recall measurement exposed (recall 0.4091 before these).
//
// Recall and precision pull in opposite directions here, so BOTH are pinned:
// broadening the factual-indicator list must not turn opinion, speculation, or
// questions into claims. Every spurious claim is one more thing the gate can
// wrongly block.
import test from 'node:test';
import assert from 'node:assert/strict';
import { extractClaims } from '../claimExtractor.js';

const texts = (t) => extractClaims(t).map((c) => c.text);
const extractedOne = (t) => {
  const out = texts(t);
  assert.equal(out.length, 1, `expected exactly 1 claim from ${JSON.stringify(t)}, got ${JSON.stringify(out)}`);
  return out[0];
};

// ── the dead percentage pattern ──────────────────────────────────────────────

test('a percentage followed by a space is extracted', () => {
  // /\b\d+%\b/ could NEVER match: '%' and ' ' are both non-word, so the
  // trailing \b fails. Every percentage claim relied on some other keyword
  // happening to be present.
  const t = 'Cache hit rate reached 87% across the fleet last quarter.';
  assert.ok(extractedOne(t).includes('87%'));
});

test('a decimal percentage at end of sentence is extracted', () => {
  assert.ok(extractedOne('Availability measured 99.99%.').includes('99.99%'));
});

// ── the length filter ────────────────────────────────────────────────────────

test('a short but material quantitative claim survives the length filter', () => {
  // 'Uptime was 99.99%.' is 18 characters and was dropped by `length > 20`.
  const out = texts('Uptime was 99.99%. The team shipped the redesign that week.');
  assert.ok(out.some((c) => c.includes('99.99%')), `got ${JSON.stringify(out)}`);
});

// ── verb coverage ────────────────────────────────────────────────────────────

test('assertion verbs beyond the original list are recognised', () => {
  for (const [t, needle] of [
    ['The SDK supports Python 3.9 and above.', 'supports'],
    ['Our model scored 92% on the internal benchmark.', 'scored'],
    ['Rate limiting begins at one thousand requests per minute.', 'begins'],
    ['The free tier includes one hundred verifications per month.', 'includes'],
    ['Upgrading to v2 drops support for the legacy signature.', 'drops'],
    ['Records are deleted after ninety days.', 'deleted'],
  ]) {
    const out = texts(t);
    assert.ok(out.length >= 1, `expected a claim for ${JSON.stringify(t)} (${needle}), got none`);
  }
});

// ── precision guards: these must NOT become claims ───────────────────────────

test('questions are not claims', () => {
  assert.deepEqual(texts('Should we revisit the caching strategy entirely?'), []);
});

test('speculation and opinion are not claims', () => {
  for (const t of [
    'It might be worth exploring a different approach here.',
    'We are proud of our security posture and our team.',
    'We think the new dashboard is a real improvement.',
    'Perhaps we should consider a larger cache next quarter.',
  ]) {
    assert.deepEqual(texts(t), [], `hedged/opinion text became a claim: ${JSON.stringify(t)}`);
  }
});

test('a hedged sentence containing a number is still not a claim', () => {
  // The number must not override the hedge — "maybe 40%" asserts nothing.
  assert.deepEqual(texts('We think latency might drop by around 40% eventually.'), []);
});

// ── shape ────────────────────────────────────────────────────────────────────

test('extracted claims keep their category and source excerpt', () => {
  const [c] = extractClaims('All customer data is encrypted at rest using AES-256.');
  assert.equal(c.category, 'security_claim');
  assert.ok(c.source_excerpt.length > 0);
  assert.equal(c.verdict_status, 'pending');
});
