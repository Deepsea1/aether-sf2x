/**
 * Tests for the multi-model diagnostic matrix.
 *
 * Run: node --test src/compare.test.js   (from mcp-worker/)
 *
 * The load-bearing property: a sentence the tribunal never supported must stay YELLOW
 * — the audit's "unverified premise". If silence can render as green, the artifact
 * fabricates verification, which is the exact failure the product exists to catch.
 * Most of these tests defend that.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  MODEL_REGISTRY,
  OVERLAP_THRESHOLD,
  SENTENCE_STATES,
  STATE_COLORS,
  availableModels,
  buildDiagnosticMatrix,
  buildModelRow,
  classifySentences,
  runComparison,
  splitSentences,
  stateCounts,
} from './compare.js';
import { renderDiagnosticCard, renderOverlayHtml } from './compareCard.js';

const ANSWER =
  'According to Section 4.1, employees receive 15 vacation days. ' +
  'Vacation accrues monthly. ' +
  'The policy was updated in 2019.';

const CLAIMS = [
  { claim: 'According to Section 4.1, employees receive 15 vacation days.', supported: false, notes: 'No employer or source is cited.' },
  { claim: 'Vacation accrues monthly.', supported: true, notes: '' },
];

describe('splitSentences', () => {
  test('splits on sentence-final punctuation', () => {
    assert.deepEqual(splitSentences('One. Two! Three?'), ['One.', 'Two!', 'Three?']);
  });

  test('does NOT split a numbered reference like Section 4.1', () => {
    const out = splitSentences('See Section 4.1 for details. Then stop.');
    assert.equal(out.length, 2);
    assert.match(out[0], /Section 4\.1/, 'the decimal must survive intact');
  });

  test('does NOT split common abbreviations, and restores them exactly', () => {
    const out = splitSentences('Use a tool, e.g. a wrench, first. Then torque it.');
    assert.equal(out.length, 2);
    assert.match(out[0], /e\.g\. a wrench/);
  });

  test('a bare number in the text is never corrupted by the placeholder', () => {
    const out = splitSentences('The value is 0 and the limit is 1. Done.');
    assert.equal(out[0], 'The value is 0 and the limit is 1.');
  });

  test('empty and junk input yield no sentences', () => {
    for (const junk of ['', '   ', null, undefined]) {
      assert.deepEqual(splitSentences(junk), []);
    }
  });
});

describe('classifySentences — silence stays yellow', () => {
  test('an unmatched sentence defaults to unverified (yellow), never verified', () => {
    const { sentences } = classifySentences(ANSWER, CLAIMS);
    const third = sentences[2];
    assert.equal(third.state, SENTENCE_STATES.UNVERIFIED);
    assert.equal(third.color, STATE_COLORS.unverified);
    assert.equal(third.matchMethod, 'none');
  });

  test('with NO claims at all, every sentence is unverified', () => {
    const { sentences } = classifySentences(ANSWER, []);
    assert.equal(sentences.length, 3);
    assert.ok(sentences.every((s) => s.state === SENTENCE_STATES.UNVERIFIED));
    assert.equal(stateCounts(sentences).verified, 0);
  });

  test('maps a supported and an unsupported claim to their sentences', () => {
    const { sentences } = classifySentences(ANSWER, CLAIMS);
    assert.equal(sentences[0].state, SENTENCE_STATES.UNSUPPORTED);
    assert.equal(sentences[0].notes, 'No employer or source is cited.');
    assert.equal(sentences[1].state, SENTENCE_STATES.VERIFIED);
  });

  test('records how the link was made', () => {
    const { sentences } = classifySentences(ANSWER, CLAIMS);
    assert.equal(sentences[0].matchMethod, 'containment');
    assert.equal(sentences[0].matchConfidence, 1);
  });

  test('a claim with no stated support colours nothing', () => {
    const { sentences } = classifySentences(ANSWER, [{ claim: 'Vacation accrues monthly.' }]);
    assert.ok(sentences.every((s) => s.state === SENTENCE_STATES.UNVERIFIED));
  });

  test('an unsupported finding is not overwritten by a later supported one', () => {
    const { sentences } = classifySentences('Alpha beta gamma delta.', [
      { claim: 'Alpha beta gamma delta.', supported: false, notes: 'bad' },
      { claim: 'Alpha beta gamma delta.', supported: true, notes: 'good' },
    ]);
    assert.equal(sentences[0].state, SENTENCE_STATES.UNSUPPORTED);
  });

  test('a claim that maps nowhere is reported, not dropped', () => {
    const { unmappedClaims } = classifySentences(ANSWER, [
      ...CLAIMS,
      { claim: 'Something about pension contributions entirely elsewhere.', supported: false, notes: 'x' },
    ]);
    assert.equal(unmappedClaims.length, 1);
    assert.match(unmappedClaims[0].claim, /pension/);
  });

  test('matches a paraphrase via token overlap above the declared threshold', () => {
    const { sentences } = classifySentences('Employees receive fifteen vacation days annually.', [
      { claim: 'employees receive fifteen vacation days annually', supported: true },
    ]);
    assert.equal(sentences[0].state, SENTENCE_STATES.VERIFIED);
    assert.ok(sentences[0].matchConfidence >= OVERLAP_THRESHOLD);
  });

  test('does not match unrelated text', () => {
    const { sentences } = classifySentences('The sky is blue today.', [
      { claim: 'Quarterly revenue rose by twelve percent.', supported: false },
    ]);
    assert.equal(sentences[0].state, SENTENCE_STATES.UNVERIFIED);
  });
});

describe('buildModelRow', () => {
  const verification = {
    trust_score: 40,
    verdict: 'contested',
    claims: CLAIMS,
    lineage_id: 'lin_9',
    tribunal_url: '/verify/lin_9',
  };

  test('passes the tribunal score through and names its basis', () => {
    const row = buildModelRow({ model: 'gpt-4o', answer: ANSWER, verification });
    assert.equal(row.reliability, 40);
    assert.match(row.reliabilityBasis, /tribunal's own trust score/);
  });

  test('never invents a score when the verification has none', () => {
    const row = buildModelRow({ model: 'gpt-4o', answer: ANSWER, verification: { claims: CLAIMS } });
    assert.equal(row.reliability, null);
    assert.match(row.reliabilityBasis, /no trust score/);
  });

  test('counts the sentence states', () => {
    const row = buildModelRow({ model: 'gpt-4o', answer: ANSWER, verification });
    assert.deepEqual(row.counts, { verified: 1, unverified: 1, unsupported: 1 });
  });

  test('an errored model is a row, not a silent omission', () => {
    const row = buildModelRow({ model: 'gemini-1.5-pro', error: 'rate limited' });
    assert.equal(row.status, 'errored');
    assert.equal(row.reliability, null);
    assert.match(row.error, /rate limited/);
  });

  test('resolves the warrant link', () => {
    const row = buildModelRow({ model: 'gpt-4o', answer: ANSWER, verification });
    assert.equal(row.warrantUrl, 'https://aether.sf2x.com/verify/lin_9');
  });

  test('unwraps a webhook-style `data` envelope', () => {
    const row = buildModelRow({
      model: 'gpt-4o',
      answer: ANSWER,
      verification: { data: { trust_score: 88, verdict: 'verified' } },
    });
    assert.equal(row.reliability, 88);
  });
});

describe('buildDiagnosticMatrix', () => {
  const rows = [
    buildModelRow({ model: 'a', answer: ANSWER, verification: { trust_score: 91, verdict: 'verified', claims: CLAIMS } }),
    buildModelRow({ model: 'b', answer: ANSWER, verification: { trust_score: 40, verdict: 'contested', claims: CLAIMS } }),
    buildModelRow({ model: 'c', error: 'no key' }),
    buildModelRow({ model: 'd', answer: ANSWER, verification: { claims: CLAIMS } }),
  ];
  const matrix = buildDiagnosticMatrix({ prompt: 'Q?', rows });

  test('ranks only the models that actually scored', () => {
    assert.deepEqual(matrix.ranking.map((r) => r.model), ['a', 'b']);
    assert.equal(matrix.comparedCount, 2);
  });

  test('lists errored and unscored models separately, not as losers', () => {
    assert.deepEqual(matrix.errored.map((e) => e.model), ['c']);
    assert.deepEqual(matrix.unscored, ['d']);
  });

  test('names a single winner', () => {
    assert.equal(matrix.winner, 'a');
    assert.deepEqual(matrix.tied, []);
  });

  test('reports a tie as a tie rather than breaking it arbitrarily', () => {
    const tie = buildDiagnosticMatrix({
      prompt: 'Q?',
      rows: [
        buildModelRow({ model: 'x', answer: ANSWER, verification: { trust_score: 80, claims: [] } }),
        buildModelRow({ model: 'y', answer: ANSWER, verification: { trust_score: 80, claims: [] } }),
      ],
    });
    assert.equal(tie.winner, null);
    assert.deepEqual(tie.tied.sort(), ['x', 'y']);
  });

  test('always carries the yellow caveat', () => {
    assert.ok(matrix.caveats.some((c) => /not a pass/i.test(c)));
  });
});

describe('availableModels — never silently compares fewer models than asked', () => {
  test('reports each unavailable model WITH the missing key', () => {
    const { available, unavailable } = availableModels(['gpt-4o', 'gemini-1.5-pro'], { OPENAI_API_KEY: 'sk-x' });
    assert.deepEqual(available, ['gpt-4o']);
    assert.equal(unavailable.length, 1);
    assert.match(unavailable[0].reason, /GOOGLE_API_KEY is not configured/);
  });

  test('an unknown model id is rejected by name', () => {
    const { unavailable } = availableModels(['not-a-model'], {});
    assert.match(unavailable[0].reason, /unknown model id/);
  });

  test('with no keys at all, nothing is available', () => {
    const { available, unavailable } = availableModels([], {});
    assert.deepEqual(available, []);
    assert.equal(unavailable.length, Object.keys(MODEL_REGISTRY).length);
  });
});

describe('runComparison — orchestration', () => {
  const generate = async (model) => `Model ${model} says vacation accrues monthly. And something unchecked.`;
  const verify = async () => ({ trust_score: 70, verdict: 'verified', claims: [{ claim: 'vacation accrues monthly', supported: true }] });

  test('produces a row per model', async () => {
    const m = await runComparison({ prompt: 'Q?', models: ['a', 'b'], generate, verify });
    assert.equal(m.rows.length, 2);
    assert.equal(m.comparedCount, 2);
  });

  test('one vendor failure degrades that row only', async () => {
    const flaky = async (model) => {
      if (model === 'b') throw new Error('vendor 500');
      return 'ok text here.';
    };
    const m = await runComparison({ prompt: 'Q?', models: ['a', 'b'], generate: flaky, verify });
    assert.equal(m.rows.find((r) => r.model === 'b').status, 'errored');
    assert.equal(m.rows.find((r) => r.model === 'a').status, 'ok');
  });

  test('an empty model answer is an errored row, not a blank pass', async () => {
    const m = await runComparison({ prompt: 'Q?', models: ['a'], generate: async () => '  ', verify });
    assert.equal(m.rows[0].status, 'errored');
    assert.match(m.rows[0].error, /no answer/);
  });

  test('rejects missing inputs loudly', async () => {
    await assert.rejects(() => runComparison({ prompt: '', models: ['a'], generate, verify }), /prompt is required/);
    await assert.rejects(() => runComparison({ prompt: 'Q', models: [], generate, verify }), /at least one model/);
    await assert.rejects(() => runComparison({ prompt: 'Q', models: ['a'], verify }), /generate adapter/);
    await assert.rejects(() => runComparison({ prompt: 'Q', models: ['a'], generate }), /verify adapter/);
  });
});

describe('renderDiagnosticCard', () => {
  const matrix = buildDiagnosticMatrix({
    prompt: 'Do employees get 15 days? <script>alert(1)</script> & more',
    rows: [
      buildModelRow({ model: 'gpt-4o', answer: ANSWER, verification: { trust_score: 40, verdict: 'contested', claims: CLAIMS } }),
      buildModelRow({ model: 'gemini-1.5-pro', error: 'no key' }),
    ],
  });
  const svg = renderDiagnosticCard(matrix);

  test('is a well-formed standalone SVG', () => {
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    assert.match(svg, /<\/svg>$/);
  });

  test('escapes the prompt — no raw script tag survives', () => {
    assert.ok(!svg.includes('<script>'), 'prompt must be XML-escaped');
    assert.match(svg, /&lt;script&gt;/);
    assert.match(svg, /&amp; more/);
  });

  test('always shows the Unverified premise legend entry and the caveat', () => {
    assert.match(svg, /Unverified premise/);
    assert.match(svg, /not a pass/i);
  });

  test('the legend has exactly the three audit colours, no duplicates', () => {
    for (const label of ['Verified', 'Unverified premise', 'Hallucination']) {
      const hits = svg.split(`>${label}<`).length - 1;
      assert.equal(hits, 1, `${label} should appear exactly once in the legend`);
    }
  });

  test('renders an errored model as unavailable rather than omitting it', () => {
    assert.match(svg, /gemini-1\.5-pro/);
    assert.match(svg, /unavailable/);
  });

  test('grows in height with the number of models', () => {
    const one = renderDiagnosticCard(buildDiagnosticMatrix({ prompt: 'q', rows: [] }));
    assert.ok(svg.length > one.length);
  });
});

describe('renderOverlayHtml', () => {
  const row = buildModelRow({
    model: 'gpt-4o',
    answer: ANSWER,
    verification: { trust_score: 40, claims: CLAIMS },
  });
  const html = renderOverlayHtml(row);

  test('marks every sentence with its state', () => {
    assert.match(html, /data-state="unsupported"/);
    assert.match(html, /data-state="verified"/);
    assert.match(html, /data-state="unverified"/);
  });

  test('an unverified sentence says so, rather than implying it passed', () => {
    assert.match(html, /unverified premise/);
  });

  test('escapes the answer text', () => {
    const evil = buildModelRow({
      model: 'm',
      answer: 'Hello <img src=x onerror=alert(1)>.',
      verification: { trust_score: 10, claims: [] },
    });
    const out = renderOverlayHtml(evil);
    assert.ok(!out.includes('<img'), 'answer text must be escaped');
    assert.match(out, /&lt;img/);
  });

  test('handles an empty answer honestly', () => {
    assert.match(renderOverlayHtml({ model: 'm', sentences: [] }), /No sentences to display/);
  });
});
