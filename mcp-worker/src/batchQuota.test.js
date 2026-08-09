/**
 * Tests for the batch quota guard.
 *
 * Run: node --test src/batchQuota.test.js   (from mcp-worker/)
 *
 * This module exists to stop a 50x spend multiplier, so the tests that matter are the
 * ones proving it cannot be talked into over-spending: the charge must equal the text
 * count (never 1), an unknown tier must fail closed, and an over-quota batch must be
 * rejected WHOLE rather than trimmed and partly billed.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  ABSOLUTE_MAX_BATCH,
  DEFAULT_TIER,
  TIERS,
  planBatch,
  projectSpend,
  resolveTier,
} from './batchQuota.js';

describe('the whole point: charge per text, never per request', () => {
  test('chargeUnits equals the text count', () => {
    for (const n of [1, 3, 20]) {
      const plan = planBatch({ tier: 'pro', textCount: n });
      assert.equal(plan.chargeUnits, n, 'a batch of n must cost n, not 1');
    }
  });

  test('a 50-text batch on pro is charged 50', () => {
    const plan = planBatch({ tier: 'pro', textCount: 50 });
    assert.equal(plan.allowed, true);
    assert.equal(plan.chargeUnits, 50);
  });

  test('projectSpend states the multiplier, not a fabricated dollar amount', () => {
    const p = projectSpend(50);
    assert.equal(p.tribunalRuns, 50);
    assert.equal(p.multiplierVsSingleVerify, 50);
    assert.match(p.note, /50x the cost/);
    assert.equal(/\$/.test(JSON.stringify(p)), false, 'must not invent currency');
  });
});

describe('fails closed on tier', () => {
  test('an unknown tier resolves to the most restrictive, not the most permissive', () => {
    const r = resolveTier('platinum-elite');
    assert.equal(r.name, DEFAULT_TIER);
    assert.equal(r.limits.perMonth, TIERS.free.perMonth);
    assert.equal(r.fellBack, true);
  });

  for (const bad of [undefined, null, '', '   ', 42, {}]) {
    test(`a ${JSON.stringify(bad)} tier falls back to free`, () => {
      assert.equal(resolveTier(bad).name, DEFAULT_TIER);
    });
  }

  test('the fallback is surfaced in the plan detail, not hidden', () => {
    const plan = planBatch({ tier: 'nonsense', textCount: 3 });
    assert.equal(plan.tier, 'free');
    assert.equal(plan.detail.tierFellBackTo, 'free');
  });

  test('an unknown tier gets the FREE batch cap, so it cannot mint a big batch', () => {
    const plan = planBatch({ tier: 'nonsense', textCount: 20 });
    assert.equal(plan.allowed, false);
    assert.match(plan.reason, /at most 5 texts per batch/);
  });

  test('tier tables are frozen — one caller cannot raise limits for everyone', () => {
    assert.throws(() => {
      'use strict';
      TIERS.free.perMonth = 1e9;
    });
  });
});

describe('batch size caps', () => {
  test('rejects above the absolute contract ceiling', () => {
    const plan = planBatch({ tier: 'enterprise', textCount: ABSOLUTE_MAX_BATCH + 1 });
    assert.equal(plan.allowed, false);
    assert.equal(plan.status, 400);
    assert.match(plan.reason, /at most 50 texts/);
  });

  test('enforces the per-tier cap below that ceiling', () => {
    assert.equal(planBatch({ tier: 'free', textCount: 6 }).allowed, false);
    assert.equal(planBatch({ tier: 'free', textCount: 5 }).allowed, true);
    assert.equal(planBatch({ tier: 'starter', textCount: 21 }).allowed, false);
    assert.equal(planBatch({ tier: 'starter', textCount: 20 }).allowed, true);
  });

  test('an empty batch is a 400, not a free pass', () => {
    const plan = planBatch({ tier: 'pro', textCount: 0 });
    assert.equal(plan.allowed, false);
    assert.equal(plan.status, 400);
  });
});

describe('quota is checked against the WHOLE batch', () => {
  test('rejects a batch that does not fit the monthly remainder', () => {
    // free: 100/month, 97 used ⇒ 3 remain, batch of 5 must not run.
    const plan = planBatch({ tier: 'free', textCount: 5, usedThisMonth: 97 });
    assert.equal(plan.allowed, false);
    assert.equal(plan.status, 429);
    assert.match(plan.reason, /only 3 remain/);
    assert.match(plan.reason, /nothing was charged/);
  });

  test('does NOT trim the batch to fit — no partial run, no partial bill', () => {
    const plan = planBatch({ tier: 'free', textCount: 5, usedThisMonth: 97 });
    assert.equal(plan.allowed, false);
    assert.equal(plan.chargeableTexts, 5, 'must not silently shrink to 3');
  });

  test('allows a batch that exactly consumes the remainder', () => {
    const plan = planBatch({ tier: 'free', textCount: 3, usedThisMonth: 97 });
    assert.equal(plan.allowed, true);
    assert.equal(plan.remainingMonth, 3);
    assert.equal(plan.chargeUnits, 3);
  });

  test('enforces the per-minute window too', () => {
    // free: 10/min, 8 used ⇒ 2 remain; a batch of 5 is within the month but not the minute.
    const plan = planBatch({ tier: 'free', textCount: 5, usedThisMinute: 8 });
    assert.equal(plan.allowed, false);
    assert.match(plan.reason, /current minute/);
  });

  test('the exploit this module exists to stop is blocked', () => {
    // Free tier, 100 requests/month. Per-request metering would let 100 batches of 50
    // through = 5,000 tribunal runs. Per-text metering stops it at 100 units, and the
    // free batch cap stops any single call at 5.
    let used = 0;
    let runs = 0;
    for (let i = 0; i < 100; i++) {
      const plan = planBatch({ tier: 'free', textCount: 5, usedThisMonth: used });
      if (!plan.allowed) break;
      used += plan.chargeUnits;
      runs += plan.chargeableTexts;
    }
    assert.equal(runs, 100, 'total tribunal runs must be bounded by the monthly quota');
    assert.ok(runs < 5000, 'the 50x multiplier must be impossible');
  });
});

describe('unlimited tiers behave correctly with Infinity', () => {
  test('enterprise allows a full batch regardless of prior usage', () => {
    const plan = planBatch({ tier: 'enterprise', textCount: 50, usedThisMonth: 10_000_000 });
    assert.equal(plan.allowed, true);
    assert.equal(plan.remainingMonth, Infinity);
    assert.equal(plan.chargeUnits, 50);
  });

  test('enterprise is still bound by the contract ceiling', () => {
    assert.equal(planBatch({ tier: 'enterprise', textCount: 51 }).allowed, false);
  });
});

describe('hostile inputs cannot widen the quota', () => {
  for (const [label, input] of [
    ['negative count', { tier: 'pro', textCount: -5 }],
    ['NaN count', { tier: 'pro', textCount: NaN }],
    ['Infinity count', { tier: 'pro', textCount: Infinity }],
    ['string count', { tier: 'pro', textCount: '5' }],
  ]) {
    test(`${label} is refused`, () => {
      const plan = planBatch(input);
      assert.equal(plan.allowed, false, 'a non-integer count must never be allowed');
    });
  }

  test('negative prior usage cannot manufacture extra quota', () => {
    const plan = planBatch({ tier: 'free', textCount: 5, usedThisMonth: -1000 });
    assert.equal(plan.remainingMonth, TIERS.free.perMonth, 'must clamp to the real limit');
  });

  test('called with no arguments at all, it refuses', () => {
    assert.equal(planBatch().allowed, false);
  });
});
