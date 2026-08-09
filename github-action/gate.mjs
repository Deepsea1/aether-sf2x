// The Aether Hallucination Guard's pass/fail decision — pure, so CI can test it.
//
// Extracted from index.js so the rule that actually fails a customer's build is
// covered by tests instead of living inside an I/O function nothing exercises.
// Behaviour is unchanged from the original inline logic: threshold first, then a
// rejected verdict, then contested-when-opted-in, then pass.

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
