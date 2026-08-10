/**
 * Tests for the Hallucination Guard's build-gate decision.
 *
 * Run: node --test github-action/gate.test.mjs
 *
 * This is the rule that fails a customer's CI build, so it is worth more than a
 * comment. The case that matters most is an unreadable score: a guard that passes
 * when it cannot read the answer is worse than no guard at all.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { evaluateGate, VERDICTS } from './gate.mjs';
import { evaluateGateV2, hasClaimDispositions, claimGateClass, GATE_MODES, CLAIM_DISPOSITIONS } from './gate.mjs';

/** Build a v2 (resolver) server response: claims with dispositions. */
const v2Result = (claims, extra = {}) => ({ claims, resolver_version: 'resolver-1.0.0', ...extra });
const claim = (disposition, materiality, extra = {}) =>
  ({ disposition, ...(materiality ? { materiality } : {}), ...extra });

describe('threshold', () => {
  test('fails below the threshold and names both numbers', () => {
    const g = evaluateGate({ trustScore: 40, verdict: 'contested', threshold: 80, correctionCount: 2 });
    assert.equal(g.failed, true);
    assert.equal(g.level, 'error');
    assert.match(g.message, /40\/80/);
    assert.match(g.message, /BELOW THRESHOLD/);
    assert.match(g.message, /2 correction/);
  });

  test('passes exactly at the threshold — the bound is inclusive', () => {
    const g = evaluateGate({ trustScore: 80, verdict: 'verified', threshold: 80 });
    assert.equal(g.failed, false);
    assert.equal(g.level, 'info');
  });

  test('the threshold rule is checked before the verdict rule', () => {
    // A rejected verdict AND a low score both fail; the message should be the
    // threshold one, matching the original ordering.
    const g = evaluateGate({ trustScore: 10, verdict: 'rejected', threshold: 80 });
    assert.match(g.message, /BELOW THRESHOLD/);
  });
});

describe('an unreadable score fails — silence is not safety', () => {
  for (const bad of [undefined, null, NaN, 'ninety', {}]) {
    test(`treats ${String(bad)} as 0 and fails the build`, () => {
      const g = evaluateGate({ trustScore: bad, verdict: 'verified', threshold: 80 });
      assert.equal(g.failed, true);
      assert.match(g.message, /0\/80/);
    });
  }

  test('a high score with an unknown verdict still passes the gate', () => {
    // The gate's job is the score and the verdict rules, not inventing a verdict.
    const g = evaluateGate({ trustScore: 95, verdict: 'unknown', threshold: 80 });
    assert.equal(g.failed, false);
  });
});

describe('verdicts', () => {
  test('rejected fails even above the threshold', () => {
    const g = evaluateGate({ trustScore: 99, verdict: 'rejected', threshold: 80, correctionCount: 3 });
    assert.equal(g.failed, true);
    assert.match(g.message, /REJECTED/);
    assert.match(g.message, /3 hallucination/);
  });

  test('contested warns but continues by default', () => {
    const g = evaluateGate({ trustScore: 90, verdict: 'contested', threshold: 80 });
    assert.equal(g.failed, false);
    assert.equal(g.level, 'warning');
    assert.match(g.message, /build continues/);
  });

  test('contested fails when fail-on-contested is set', () => {
    const g = evaluateGate({ trustScore: 90, verdict: 'contested', threshold: 80, failOnContested: true });
    assert.equal(g.failed, true);
    assert.equal(g.level, 'error');
    assert.match(g.message, /fail-on-contested=true/);
  });

  test('verdict casing and padding do not change the decision', () => {
    const g = evaluateGate({ trustScore: 99, verdict: '  REJECTED  ', threshold: 80 });
    assert.equal(g.failed, true);
    assert.match(g.message, /REJECTED/);
  });

  test('verified passes cleanly', () => {
    const g = evaluateGate({ trustScore: 91, verdict: 'verified', threshold: 80 });
    assert.equal(g.failed, false);
    assert.equal(g.level, 'info');
    assert.match(g.message, /PASSED/);
  });
});

describe('defaults', () => {
  test('an absent threshold defaults to 80', () => {
    assert.equal(evaluateGate({ trustScore: 79, verdict: 'verified' }).failed, true);
    assert.equal(evaluateGate({ trustScore: 80, verdict: 'verified' }).failed, false);
  });

  test('the documented verdicts are the ones handled', () => {
    for (const v of VERDICTS) {
      assert.doesNotThrow(() => evaluateGate({ trustScore: 90, verdict: v, threshold: 80 }));
    }
  });
});

// ── v2: claim-disposition gating ────────────────────────────────────────────

describe('v2: detecting claim dispositions', () => {
  test('a legacy response (trust_score + verdict, no claims) has none', () => {
    assert.equal(hasClaimDispositions({ trust_score: 90, verdict: 'verified' }), false);
  });

  test('claim rows without a disposition (older PR server) fall back to v1', () => {
    assert.equal(hasClaimDispositions({ claims: [{ text: 'x', policy_decision: 'warn' }] }), false);
  });

  test('a mixed set — one row missing its disposition — falls back to v1', () => {
    assert.equal(
      hasClaimDispositions({ claims: [claim('blocked'), { text: 'no disposition' }] }),
      false,
    );
  });

  test('every row carrying a disposition is resolver output', () => {
    assert.equal(hasClaimDispositions({ claims: [claim('blocked'), claim('needs_review', 'low')] }), true);
  });

  test('an empty claims array is resolver output only with resolver_version', () => {
    assert.equal(hasClaimDispositions(v2Result([])), true);
    assert.equal(hasClaimDispositions({ claims: [] }), false);
  });
});

describe('v2: dispositions present — enforcing', () => {
  test('fails on a blocked claim', () => {
    const g = evaluateGateV2(v2Result([claim('blocked'), claim('verified_for_stated_use')]), { mode: 'enforcing' });
    assert.equal(g.failed, true);
    assert.equal(g.level, 'error');
    assert.equal(g.usedDispositions, true);
    assert.equal(g.blockedCount, 1);
    assert.match(g.message, /1 claim\(s\) BLOCKED/);
  });

  test('fails on needs_review at high materiality', () => {
    const g = evaluateGateV2(v2Result([claim('needs_review', 'high')]), { mode: 'enforcing' });
    assert.equal(g.failed, true);
    assert.equal(g.reviewCount, 1);
    assert.match(g.message, /1 high-materiality claim\(s\) need review/);
  });

  test('fails on contradicted at critical materiality', () => {
    const g = evaluateGateV2(v2Result([claim('contradicted', 'critical')]), { mode: 'enforcing' });
    assert.equal(g.failed, true);
  });

  test('needs_review at normal or low materiality passes', () => {
    const g = evaluateGateV2(v2Result([claim('needs_review', 'normal'), claim('needs_review', 'low')]), { mode: 'enforcing' });
    assert.equal(g.failed, false);
    assert.equal(g.level, 'info');
  });

  test('missing materiality on needs_review gates — unknown stakes are not low stakes', () => {
    const g = evaluateGateV2(v2Result([claim('needs_review')]), { mode: 'enforcing' });
    assert.equal(g.failed, true);
    assert.equal(claimGateClass(claim('contradicted', 'weird-value')), 'review');
  });

  test('passes on clean dispositions', () => {
    const g = evaluateGateV2(
      v2Result([claim('verified_for_stated_use'), claim('supported_with_limits'), claim('out_of_scope')]),
      { mode: 'enforcing' },
    );
    assert.equal(g.failed, false);
    assert.equal(g.level, 'info');
    assert.match(g.message, /PASSED — 3 claim\(s\)/);
  });

  test('the raw score is IGNORED: a 0 trust score with clean dispositions passes', () => {
    const g = evaluateGateV2(v2Result([claim('verified_for_stated_use')], { trust_score: 0 }), { mode: 'enforcing' });
    assert.equal(g.failed, false);
  });

  test('the raw score is IGNORED: a 99 trust score with a blocked claim fails', () => {
    const g = evaluateGateV2(v2Result([claim('blocked')], { trust_score: 99, verdict: 'verified' }), { mode: 'enforcing' });
    assert.equal(g.failed, true);
  });
});

describe('v2: dispositions present — advisory (the default)', () => {
  test('would-block input passes with the explicit advisory report line', () => {
    const g = evaluateGateV2(v2Result([claim('blocked'), claim('needs_review', 'high')]), { mode: 'advisory' });
    assert.equal(g.failed, false);
    assert.equal(g.level, 'warning');
    assert.match(g.message, /advisory mode — would have blocked 1 claim\(s\) and flagged 1 claim\(s\) for review/);
  });

  test('advisory is the default mode', () => {
    const g = evaluateGateV2(v2Result([claim('blocked')]));
    assert.equal(g.failed, false);
    assert.equal(g.mode, 'advisory');
  });

  test('advisory NEVER fails — even when every claim is blocked', () => {
    const g = evaluateGateV2(v2Result([claim('blocked'), claim('blocked'), claim('blocked')]), { mode: 'advisory' });
    assert.equal(g.failed, false);
    assert.equal(g.blockedCount, 3);
  });

  test('clean dispositions pass with a clean message', () => {
    const g = evaluateGateV2(v2Result([claim('verified_for_stated_use')]), { mode: 'advisory' });
    assert.equal(g.failed, false);
    assert.equal(g.level, 'info');
  });
});

describe('v2: dispositions absent — the legacy threshold rule, unchanged', () => {
  test('enforcing reproduces evaluateGate exactly on a below-threshold response', () => {
    const legacy = { trust_score: 40, verdict: 'contested', corrections: ['a', 'b'] };
    const v1 = evaluateGate({ trustScore: 40, verdict: 'contested', threshold: 80, correctionCount: 2 });
    const g = evaluateGateV2(legacy, { mode: 'enforcing', threshold: 80 });
    assert.equal(g.failed, v1.failed);
    assert.equal(g.level, v1.level);
    assert.equal(g.message, v1.message);
    assert.equal(g.usedDispositions, false);
  });

  test('enforcing fails on a rejected verdict', () => {
    const g = evaluateGateV2({ trust_score: 99, verdict: 'rejected' }, { mode: 'enforcing' });
    assert.equal(g.failed, true);
    assert.match(g.message, /REJECTED/);
  });

  test('enforcing honors fail-on-contested', () => {
    const g = evaluateGateV2({ trust_score: 90, verdict: 'contested' }, { mode: 'enforcing', failOnContested: true });
    assert.equal(g.failed, true);
  });

  test('advisory downgrades a failing legacy gate to a would-have-failed warning', () => {
    const g = evaluateGateV2({ trust_score: 40, verdict: 'contested' }, { mode: 'advisory', threshold: 80 });
    assert.equal(g.failed, false);
    assert.equal(g.level, 'warning');
    assert.match(g.message, /advisory mode — would have failed/);
    assert.match(g.message, /BELOW THRESHOLD/);
  });

  test('advisory passes a passing legacy gate through unchanged', () => {
    const v1 = evaluateGate({ trustScore: 91, verdict: 'verified', threshold: 80 });
    const g = evaluateGateV2({ trust_score: 91, verdict: 'verified' }, { mode: 'advisory', threshold: 80 });
    assert.equal(g.failed, false);
    assert.equal(g.message, v1.message);
  });

  test('an unreadable score still fails enforcing — silence is not safety', () => {
    const g = evaluateGateV2({ verdict: 'verified' }, { mode: 'enforcing', threshold: 80 });
    assert.equal(g.failed, true);
    assert.match(g.message, /0\/80/);
  });
});

describe('v2: exported contracts', () => {
  test('the gate modes are advisory and enforcing, advisory first', () => {
    assert.deepEqual([...GATE_MODES], ['advisory', 'enforcing']);
  });

  test('the documented dispositions are handled without throwing', () => {
    for (const d of CLAIM_DISPOSITIONS) {
      assert.doesNotThrow(() => evaluateGateV2(v2Result([claim(d, 'high')]), { mode: 'enforcing' }));
    }
  });
});
