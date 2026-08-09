/**
 * Batch quota metering — the guard that stops `batchVerify` from becoming a bill.
 *
 * THE PROBLEM. `POST /batchVerify` runs the full tribunal once **per text**, up to 50
 * per call, but the published rate limits are counted **per request**. So one request
 * can cost fifty. A Free-tier caller nominally capped at 100 requests/month can trigger
 * 5,000 tribunal runs without ever exceeding their quota — a 50× spend multiplier that
 * looks like normal usage in every per-request metric.
 *
 * THE FIX, and it is arithmetic rather than cleverness: charge `texts.length` against
 * the caller's quota instead of 1, and refuse a batch that does not fit. This module is
 * pure so the rule can be tested exhaustively; wire it into the `batchVerify` backend
 * function before the tribunal runs.
 *
 *   import { planBatch, TIERS } from './batchQuota.js';
 *   const plan = planBatch({ tier, textCount: texts.length, usedThisMonth, usedThisMinute });
 *   if (!plan.allowed) return json({ error: plan.reason, ...plan.detail }, plan.status);
 *   // …run the tribunal on exactly plan.chargeableTexts texts, then:
 *   await recordUsage(plan.chargeUnits);   // NOT 1
 *
 * DESIGN NOTES, because each one is a way this could go wrong:
 *   · It fails CLOSED. An unknown tier is the most restrictive tier, not the most
 *     permissive — a typo in a tier name must never mint unlimited quota.
 *   · It never PARTIALLY runs a batch. Trimming to fit and billing for the remainder is
 *     how customers get surprise invoices; an over-quota batch is rejected whole, with
 *     the numbers needed to retry smaller.
 *   · `Infinity` is a real value here (Enterprise), and every comparison is written to
 *     behave correctly with it rather than special-casing.
 *   · Nothing here talks to a database. Usage counters are passed in, so the same rule
 *     is testable offline and cannot silently depend on a stale read.
 */

/**
 * TIERS — the published limits, plus the one number the docs do not yet state:
 * `maxBatch`, the largest batch a tier may submit at once. A monthly quota alone does
 * not bound a single request's cost, which is exactly how the multiplier hides.
 */
export const TIERS = Object.freeze({
  free: Object.freeze({ perMinute: 10, perMonth: 100, maxBatch: 5 }),
  starter: Object.freeze({ perMinute: 60, perMonth: 5000, maxBatch: 20 }),
  pro: Object.freeze({ perMinute: 200, perMonth: 25000, maxBatch: 50 }),
  enterprise: Object.freeze({ perMinute: Infinity, perMonth: Infinity, maxBatch: 50 }),
});

/** The hard ceiling from the API contract, regardless of tier. */
export const ABSOLUTE_MAX_BATCH = 50;

/** Unknown or missing tier → the most restrictive one. Fail closed, never open. */
export const DEFAULT_TIER = 'free';

/** Resolve a tier name to its limits, falling back to the most restrictive. */
export function resolveTier(tier) {
  const key = String(tier || '').trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(TIERS, key)
    ? { name: key, limits: TIERS[key] }
    : { name: DEFAULT_TIER, limits: TIERS[DEFAULT_TIER], fellBack: true };
}

function nonNegativeInt(value) {
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

/**
 * planBatch — decide whether a batch may run, and what it should be charged.
 *
 * @param {object} input
 * @param {string} input.tier            caller's tier name
 * @param {number} input.textCount       how many texts the batch contains
 * @param {number} [input.usedThisMonth] verification units already used this month
 * @param {number} [input.usedThisMinute] units already used in the current minute
 * @returns {{
 *   allowed: boolean, status: number, reason: string|null,
 *   tier: string, chargeUnits: number, chargeableTexts: number,
 *   remainingMonth: number, remainingMinute: number, detail: object
 * }}
 *
 * `chargeUnits` is the number to record against usage — it equals `textCount`, never 1.
 * That single substitution is the whole point of this module.
 */
export function planBatch({ tier, textCount, usedThisMonth = 0, usedThisMinute = 0 } = {}) {
  const { name, limits, fellBack } = resolveTier(tier);
  const count = nonNegativeInt(textCount);
  const usedMonth = nonNegativeInt(usedThisMonth);
  const usedMinute = nonNegativeInt(usedThisMinute);

  const remainingMonth = limits.perMonth === Infinity ? Infinity : Math.max(0, limits.perMonth - usedMonth);
  const remainingMinute = limits.perMinute === Infinity ? Infinity : Math.max(0, limits.perMinute - usedMinute);

  const base = {
    tier: name,
    chargeUnits: count,
    chargeableTexts: count,
    remainingMonth,
    remainingMinute,
    detail: {
      requested: count,
      maxBatch: limits.maxBatch,
      perMinute: limits.perMinute,
      perMonth: limits.perMonth,
      usedThisMonth: usedMonth,
      usedThisMinute: usedMinute,
      ...(fellBack ? { tierFellBackTo: DEFAULT_TIER } : {}),
    },
  };

  if (count === 0) {
    return { ...base, allowed: false, status: 400, reason: 'texts must contain at least one item' };
  }

  if (count > ABSOLUTE_MAX_BATCH) {
    return {
      ...base,
      allowed: false,
      status: 400,
      reason: `a batch may contain at most ${ABSOLUTE_MAX_BATCH} texts (received ${count})`,
    };
  }

  if (count > limits.maxBatch) {
    return {
      ...base,
      allowed: false,
      status: 400,
      reason:
        `the ${name} tier allows at most ${limits.maxBatch} texts per batch (received ${count}). ` +
        `Split the batch or upgrade the tier.`,
    };
  }

  // Whole-batch check: never trim and bill the remainder.
  if (count > remainingMonth) {
    return {
      ...base,
      allowed: false,
      status: 429,
      reason:
        `this batch needs ${count} verification(s) but only ${remainingMonth} remain in the ` +
        `monthly quota for the ${name} tier. The batch was not run and nothing was charged.`,
    };
  }

  if (count > remainingMinute) {
    return {
      ...base,
      allowed: false,
      status: 429,
      reason:
        `this batch needs ${count} verification(s) but only ${remainingMinute} remain in the ` +
        `current minute for the ${name} tier. Retry shortly; nothing was charged.`,
    };
  }

  return { ...base, allowed: true, status: 200, reason: null };
}

/**
 * projectSpend — what a batch costs relative to a single verification.
 *
 * Deliberately expressed as a MULTIPLIER, not currency: the tribunal's per-run cost
 * depends on which models back it, and inventing a dollar figure would be a fabricated
 * number in a system whose whole purpose is not fabricating numbers. The multiplier is
 * structural and exact.
 */
export function projectSpend(textCount) {
  const count = nonNegativeInt(textCount);
  return {
    tribunalRuns: count,
    multiplierVsSingleVerify: count,
    note:
      count === 0
        ? 'no texts, no spend'
        : `this call runs the tribunal ${count} time(s) — ${count}x the cost of one /verifyResponse`,
  };
}
