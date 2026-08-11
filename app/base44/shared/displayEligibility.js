// Display eligibility (MASTER_PLAN v5 §20) — the anti-laundering rail as a
// pure computation. A v2-signed warrant binds the EXACT answer text via
// answer_text_sha256; display eligibility asks: does the text being displayed
// RIGHT NOW still carry this warrant? Four independent checks, ALL required:
//
//   content_hash_match — sha256(displayed text) === warrant.answer_text_sha256
//   status_active      — validity_status is the affirmatively-valid value
//   not_expired        — expiry_date is present, parseable, and in the future
//   v2_bound           — the warrant carries answer_text_sha256 at all
//
// Fail closed everywhere: a legacy warrant with no content binding is NEVER
// eligible (there is nothing to match the displayed text against), a missing
// or unparseable expiry_date reads as expired, and only 'valid' passes the
// status check — 'weak', 'invalid', 'insufficient_evidence', 'contested', and
// 'expired' all represent doubt, and doubt never earns display (§25.3: never
// green for stale/invalidated/superseded/disputed). Pure: no I/O, never
// throws on malformed input, injectable clock for the harness.

// The single affirmatively-valid status. The Warrant enum is
// ['valid', 'weak', 'invalid', 'insufficient_evidence', 'contested',
// 'expired'] (entities/Warrant.jsonc); everything except 'valid' fails.
export const ELIGIBLE_VALIDITY_STATUS = 'valid';

/**
 * Check whether a warrant is display-eligible for the given content hash.
 * Strict comparison: content_sha256 must be the lowercase SHA-256 hex of the
 * answer text AS PERSISTED (callers normalize case before calling — the op
 * boundary does; the persisted hash is always lowercase hex).
 *
 * @param {{
 *   warrant?: object,
 *   content_sha256?: string,
 *   now?: () => number,
 * }} args — `now` defaults to Date.now (inject a fixed clock in tests).
 * @returns {{
 *   eligible: boolean,
 *   reasons: string[],
 *   checked: { content_hash_match: boolean, status_active: boolean, not_expired: boolean, v2_bound: boolean },
 * }}
 */
export function checkEligibility({ warrant, content_sha256, now } = {}) {
  const w = warrant && typeof warrant === 'object' ? warrant : {};
  const clock = typeof now === 'function' ? now : () => Date.now();
  const reasons = [];

  // v2_bound — the warrant carries a content binding at all. A pre-v2 warrant
  // has no answer_text_sha256, so no displayed text can ever prove it still
  // carries the warrant — fail closed, never eligible.
  const bound = typeof w.answer_text_sha256 === 'string' && w.answer_text_sha256.length > 0;
  if (!bound) reasons.push('no content binding (pre-v2 warrant)');

  // content_hash_match — the exact-text check. Strict equality against the
  // hash the v2 signature was computed over; without a binding there is
  // nothing to match, so the mismatch reason only fires on bound warrants.
  const match = bound && typeof content_sha256 === 'string' && content_sha256 === w.answer_text_sha256;
  if (bound && !match) reasons.push('content hash does not match the warranted text');

  // status_active — only the affirmatively-valid status passes.
  const active = w.validity_status === ELIGIBLE_VALIDITY_STATUS;
  if (!active) reasons.push(`validity_status is '${w.validity_status ?? 'absent'}' — only '${ELIGIBLE_VALIDITY_STATUS}' is display-eligible`);

  // not_expired — expiry_date against the injected clock. Every v2 writer
  // sets an expiry, so a missing or unparseable one is a malformed row and
  // reads as expired (the verdictReuse isLive fail-closed pattern). A warrant
  // expiring exactly now is expired, not fresh.
  const t = new Date(w.expiry_date ?? '').getTime();
  const fresh = Number.isFinite(t) && t > clock();
  if (!fresh) reasons.push(Number.isFinite(t) ? 'warrant expired' : 'no valid expiry_date on the warrant');

  return {
    eligible: match && active && fresh && bound,
    reasons,
    checked: { content_hash_match: match, status_active: active, not_expired: fresh, v2_bound: bound },
  };
}
