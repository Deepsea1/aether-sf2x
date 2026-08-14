// The Aether Hallucination Guard's pass/fail decision — pure, so CI can test it.
//
// Two layers live here:
//   · evaluateGate   — the v1 rule (trust-score threshold, then verdict), byte-identical
//     to the original inline logic so older servers keep their exact behaviour;
//   · evaluateGateV2 — the v2 rule: when the server response carries per-claim
//     dispositions (the MASTER_PLAN §8.1 resolver), gate on those and IGNORE the raw
//     score — a single confidence score is exactly the decision §1.4 forbids. Advisory
//     mode (the default — §18.2: no default hard-blocking without a measured
//     false-block rate) NEVER fails the build; it reports what enforcing would do.

/** Verdicts the tribunal can return (docs/API_REFERENCE.md). */
export const VERDICTS = Object.freeze(['verified', 'contested', 'rejected']);

/**
 * evaluateGate — decide whether this verification should fail the build.
 *
 * Returns { failed, level, message }:
 *   level 'error'   → fail the build
 *   level 'warning' → continue, but say so
 *   level 'info'    → clean pass
 *
 * A missing or non-numeric trust score is treated as 0 and FAILS. That is
 * deliberate for a CI gate: an unreadable score is not evidence of safety, and a
 * guard that passes when it cannot read the answer is worse than no guard.
 */
export function evaluateGate({ trustScore, verdict, threshold, failOnContested = false, correctionCount = 0 }) {
  const score = typeof trustScore === 'number' && Number.isFinite(trustScore) ? trustScore : 0;
  const limit = typeof threshold === 'number' && Number.isFinite(threshold) ? threshold : 80;
  const v = typeof verdict === 'string' && verdict.trim() ? verdict.trim().toLowerCase() : 'unknown';

  if (score < limit) {
    return {
      failed: true,
      level: 'error',
      message:
        `Aether: Trust score ${score}/${limit} — BELOW THRESHOLD. Verdict: ${v}. ` +
        `${correctionCount} correction(s) needed.`,
    };
  }

  if (v === 'rejected') {
    return {
      failed: true,
      level: 'error',
      message: `Aether: Verdict is REJECTED. ${correctionCount} hallucination(s) detected.`,
    };
  }

  if (v === 'contested' && failOnContested) {
    return {
      failed: true,
      level: 'error',
      message:
        `Aether: Verdict is CONTESTED (fail-on-contested=true). ` +
        `${correctionCount} correction(s) needed.`,
    };
  }

  if (v === 'contested') {
    return {
      failed: false,
      level: 'warning',
      message:
        `Aether: Verdict is CONTESTED but build continues (fail-on-contested=false). ` +
        `Trust score: ${score}/100. ${correctionCount} correction(s) available.`,
    };
  }

  return {
    failed: false,
    level: 'info',
    message: `Aether: PASSED — Trust score ${score}/100, verdict: ${v}`,
  };
}

// ── v2: claim-disposition gating (advisory by default) ──────────────────────

/** Gate modes. Advisory reports but never fails; enforcing fails the build. */
export const GATE_MODES = Object.freeze(['advisory', 'enforcing']);

/** Claim dispositions the resolver can return (decisionResolver.js CLAIM_VERDICTS). */
export const CLAIM_DISPOSITIONS = Object.freeze([
  'verified_for_stated_use',
  'supported_with_limits',
  'needs_review',
  'not_supported',
  'contradicted',
  'out_of_scope',
  'blocked',
  'unknown',
]);

/**
 * hasClaimDispositions — does this server response carry per-claim dispositions?
 *
 * True when every claim row has a non-empty string `disposition` (a server that
 * runs the claim resolver). An empty claims array counts only when the top-level
 * `resolver_version` marks it as resolver output. Anything else — a legacy
 * response, claim rows without dispositions, or a mixed/partial set — is NOT
 * disposition output and falls back to the v1 threshold gate.
 */
export function hasClaimDispositions(result) {
  if (!result || typeof result !== 'object' || !Array.isArray(result.claims)) return false;
  if (result.claims.length === 0) {
    return typeof result.resolver_version === 'string' && result.resolver_version.trim() !== '';
  }
  return result.claims.every((c) => c && typeof c.disposition === 'string' && c.disposition.trim() !== '');
}

/**
 * claimGateClass — how one claim participates in the dispositions gate:
 *   'blocked' → always gates;
 *   'review'  → needs_review/contradicted at high or critical materiality — and at
 *               MISSING or unreadable materiality, deliberately: a gate that cannot
 *               read the stakes must not assume they are low;
 *   'clear'   → never gates.
 */
export function claimGateClass(claim) {
  const d = claim && typeof claim.disposition === 'string' ? claim.disposition.trim().toLowerCase() : '';
  if (d === 'blocked') return 'blocked';
  if (d === 'needs_review' || d === 'contradicted') {
    const m = typeof claim.materiality === 'string' ? claim.materiality.trim().toLowerCase() : '';
    return m === 'normal' || m === 'low' ? 'clear' : 'review';
  }
  return 'clear';
}

/**
 * evaluateGateV2 — the v2 build-gate decision.
 *
 * Returns { failed, level, message, mode, usedDispositions, blockedCount, reviewCount }.
 *
 * With dispositions: any `blocked` claim fails enforcing; `needs_review` or
 * `contradicted` at high materiality fails enforcing; everything else passes. The
 * raw trust score is IGNORED on this path — no single score is the decision.
 * Without dispositions (an older server): the v1 evaluateGate rule, unchanged.
 * Advisory mode never fails either path — it downgrades the failure to a warning
 * stating exactly what enforcing would have done.
 */
export function evaluateGateV2(result, { mode = 'advisory', threshold = 80, failOnContested = false } = {}) {
  const gateMode = mode === 'enforcing' ? 'enforcing' : 'advisory';

  // An explicit model-only label is stronger evidence than a legacy score. It
  // cannot authorize an enforcing CI decision; advisory mode reports the gap.
  if (result?.truth_status === 'UNKNOWN' && result?.evidence_basis === 'MODEL_ASSESSED') {
    const message = 'Aether: model-assessed result only (UNKNOWN / L1); no factual verification is available.';
    return gateMode === 'enforcing'
      ? { failed: true, level: 'error', message, mode: gateMode, usedDispositions: false, blockedCount: 0, reviewCount: 0 }
      : { failed: false, level: 'warning', message, mode: gateMode, usedDispositions: false, blockedCount: 0, reviewCount: 0 };
  }

  if (hasClaimDispositions(result)) {
    const claims = result.claims;
    const blockedCount = claims.filter((c) => claimGateClass(c) === 'blocked').length;
    const reviewCount = claims.filter((c) => claimGateClass(c) === 'review').length;
    const base = { mode: gateMode, usedDispositions: true, blockedCount, reviewCount };

    if (blockedCount === 0 && reviewCount === 0) {
      return {
        ...base,
        failed: false,
        level: 'info',
        message: `Aether: PASSED — ${claims.length} claim(s), no blocking dispositions (mode: ${gateMode}).`,
      };
    }

    if (gateMode === 'enforcing') {
      const message = blockedCount > 0
        ? `Aether: ${blockedCount} claim(s) BLOCKED by policy (mode: enforcing). ` +
          `${reviewCount} high-materiality claim(s) also need review.`
        : `Aether: ${reviewCount} high-materiality claim(s) need review (mode: enforcing).`;
      return { ...base, failed: true, level: 'error', message };
    }

    return {
      ...base,
      failed: false,
      level: 'warning',
      message:
        `Aether: advisory mode — would have blocked ${blockedCount} claim(s) and flagged ` +
        `${reviewCount} claim(s) for review. The build continues; set mode: enforcing to enforce.`,
    };
  }

  // An older server — no dispositions. The v1 rule decides, unchanged.
  const corrections = Array.isArray(result?.corrections) ? result.corrections : [];
  const gate = evaluateGate({
    trustScore: typeof result?.trust_score === 'number' ? result.trust_score : undefined,
    verdict: typeof result?.verdict === 'string' ? result.verdict : 'unknown',
    threshold,
    failOnContested,
    correctionCount: corrections.length,
  });
  const base = { mode: gateMode, usedDispositions: false, blockedCount: 0, reviewCount: 0 };
  if (gateMode === 'enforcing' || !gate.failed) return { ...gate, ...base };
  return {
    ...base,
    failed: false,
    level: 'warning',
    message:
      `Aether: advisory mode — would have failed: ${gate.message.replace(/^Aether: /, '')} ` +
      `The build continues; set mode: enforcing to enforce.`,
  };
}
