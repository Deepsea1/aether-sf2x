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
