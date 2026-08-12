// Claim-shape normalization — the boundary between model output and typed
// entity fields.
//
// The verify endpoints ask the model for `claims: [{ claim: string, supported:
// boolean, notes: string }]` via a JSON schema, then wrote `claims.map(c =>
// c.claim)` straight into Warrant.premises. A requested schema is not a
// guarantee: when a model emitted a non-string `claim`, Warrant.create rejected
// the row and the public endpoint returned 500 ("Error in field premises.0:
// Input should be a valid string" — caught live 2026-08-12 by probe E1 in
// scripts/verify-live.mjs, intermittent because it depends on model output).
//
// Rule: coerce at the boundary, drop what has no recoverable text, and cap
// length so one runaway generation cannot blow an entity field. A verification
// must never fail to persist because the model phrased its own output oddly.

// Cap per claim. Warrant.premises holds short claim sentences; anything longer
// is a generation artifact, not a claim.
const MAX_CLAIM_CHARS = 2000;
// Warrant.premises has always been sliced to 20 by the callers — kept here so
// every writer applies the same bound.
const MAX_PREMISES = 20;

// Stringifications that carry no actual content — an empty object or array
// serializes to something truthy but says nothing, and a premise reading "{}"
// is worse than no premise at all.
const EMPTY_SERIALIZATIONS = new Set(['{}', '[]', '""', 'null', 'undefined']);

// Best-effort text extraction. Strings win; objects are JSON-stringified so the
// content survives for a human reading the warrant rather than vanishing.
function claimText(value) {
  if (typeof value === 'string') return value.trim();
  if (value == null) return '';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    const s = JSON.stringify(value).trim();
    return EMPTY_SERIALIZATIONS.has(s) ? '' : s;
  } catch {
    return '';
  }
}

/**
 * Normalize a model-produced claims array into typed, persistable records.
 * Entries with no recoverable claim text are dropped — an empty premise is
 * noise in a warrant, and a null one is a 500.
 *
 * @param {unknown} raw
 * @returns {Array<{ claim: string, supported: boolean, notes: string }>}
 */
export function normalizeClaims(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const claim = claimText(entry.claim).slice(0, MAX_CLAIM_CHARS);
    if (!claim) continue;
    out.push({
      claim,
      supported: entry.supported === true || entry.supported === 'true' || entry.supported === 'yes',
      notes: entry.notes == null ? '' : claimText(entry.notes),
    });
  }
  return out;
}

/**
 * Warrant.premises projection: strings only, bounded. Feed it the output of
 * normalizeClaims — passing raw model output would defeat the purpose.
 *
 * @param {Array<{ claim: string }>} normalized
 * @returns {string[]}
 */
export function premisesFrom(normalized) {
  if (!Array.isArray(normalized)) return [];
  return normalized
    .map((c) => (c && typeof c.claim === 'string' ? c.claim : ''))
    .filter(Boolean)
    .slice(0, MAX_PREMISES);
}
