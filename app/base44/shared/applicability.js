// Applicability v1 + the deterministic evidence checks for the PR wedge
// (MASTER_PLAN v5 §5.4). Pure module: no imports, no I/O — every function is
// deterministic given its inputs, so the whole file is harness-testable.
//
// v1 is HONEST about what determinism supports: only timeMatch (fetch success /
// HTTP date vs now) and versionMatch (version-like tokens present in BOTH the
// claim and the fetched content) are computed. Subject, population,
// jurisdiction, and condition need semantics v1 does not have and stay
// 'unknown'. A 'yes' is never fabricated.

export const APPLICABILITY_VERSION = 'applicability-1.0.0';

// Version-like tokens: dotted versions (v1.2.3 / 1.2 / semver) and full ISO
// dates. Bare years are deliberately EXCLUDED — a copyright-footer year would
// fabricate a 'yes' on almost any page, and a fabricated match is worse than
// an honest 'unknown'.
const VERSION_TOKEN_RE = /\bv?\d+\.\d+(?:\.\d+)*\b|\b\d{4}-\d{2}-\d{2}\b/g;

// A fetched HTTP Date within this window of now counts as a fresh serve.
const FRESH_HTTP_DATE_MS = 7 * 24 * 60 * 60 * 1000;

function versionTokens(text) {
  const found = String(text || '').match(VERSION_TOKEN_RE) || [];
  return new Set(found.map((t) => t.toLowerCase().replace(/^v(?=\d)/, '')));
}

function timeMatchFor(snapshot, nowMs) {
  if (!snapshot || snapshot.fetchedOk !== true) return 'unknown';
  const t = Date.parse(snapshot.httpDate || '');
  if (!Number.isFinite(t)) return 'partial'; // fetched live, but the server sent no verifiable date
  return Math.abs(nowMs - t) <= FRESH_HTTP_DATE_MS ? 'yes' : 'partial';
}

function versionMatchFor(claimText, snapshot) {
  const claimTok = versionTokens(claimText);
  if (!claimTok.size) return { match: 'unknown', note: 'no version-like tokens in claim' };
  if (!snapshot || snapshot.fetchedOk !== true || !String(snapshot.contentExcerpt || '').trim()) {
    return { match: 'unknown', note: 'no fetched content to compare' };
  }
  const contentTok = versionTokens(snapshot.contentExcerpt);
  if (!contentTok.size) return { match: 'unknown', note: 'no version-like tokens in content' };
  const matched = [...claimTok].filter((t) => contentTok.has(t));
  if (matched.length) return { match: 'yes', note: `token match: ${matched.join(', ')}` };
  return { match: 'no', note: 'version-like tokens present on both sides but none match' };
}

// ApplicabilityAssessment v1 (§5.4): six dimensions, each yes|partial|no|unknown,
// plus an aggregate result and a rationale naming exactly what was computed.
// The optional second argument injects the clock for harness determinism.
export function assessApplicability({ claimText, snapshot } = {}, { now = Date.now() } = {}) {
  const time = timeMatchFor(snapshot, now);
  const version = versionMatchFor(claimText, snapshot);
  const dims = {
    subjectMatch: 'unknown',
    populationMatch: 'unknown',
    jurisdictionMatch: 'unknown',
    timeMatch: time,
    versionMatch: version.match,
    conditionMatch: 'unknown',
  };
  const values = Object.values(dims);
  let result;
  if (values.includes('no')) result = 'not_applicable';
  else if (values.includes('yes') || values.includes('partial')) result = 'partially_applicable';
  else result = 'undetermined';
  const rationale = [
    `v1 deterministic assessment (${APPLICABILITY_VERSION})`,
    `time=${time}${snapshot && snapshot.fetchedOk === true ? '' : ' (source not fetched)'}`,
    `version=${version.match} (${version.note})`,
    'subject/population/jurisdiction/condition undetermined in v1',
  ].join(' · ');
  return { ...dims, result, rationale };
}

// Deterministic quote containment — does a normalized span of 8+ consecutive
// claim words appear verbatim in the fetched content? No LLM, no fuzz: both
// sides are lowercased and stripped to word tokens, then every 8-word window
// of the claim is tested for substring containment in the normalized content.
// Claims with fewer than 8 normalized words return false (fail closed — too
// short to establish a quote). Cited URLs are stripped from the claim first so
// a citation can never count as its own quote.

const QUOTE_SPAN_WORDS = 8;

function normalizeWords(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/https?:\/\/[^\s]+/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

export function quotePresent(claimText, content) {
  const claimWords = normalizeWords(claimText);
  if (claimWords.length < QUOTE_SPAN_WORDS) return false;
  const contentWords = normalizeWords(content);
  if (!contentWords.length) return false;
  const haystack = ` ${contentWords.join(' ')} `;
  for (let i = 0; i + QUOTE_SPAN_WORDS <= claimWords.length; i++) {
    const span = ` ${claimWords.slice(i, i + QUOTE_SPAN_WORDS).join(' ')} `;
    if (haystack.includes(span)) return true;
  }
  return false;
}

// The wedge's resolver-input derivation — turns what githubPrVerify actually
// knows about a claim (policy decision, Flash signals, verdict pipeline
// status, pack scope, materiality, grounded citations) into the §8.1 ladder
// signals consumed by resolveClaim. Pure and total so the ladder wiring is
// harness-testable without the Deno runtime.
//
// Evidence semantics (v1, fail closed):
//   - citations with a verified quote        → limited (supported_with_limits —
//     v1 applicability can never establish full applicability, so full
//     verification is never claimed)
//   - MATERIAL (high/critical) claim whose citations all failed to fetch or
//     never contained the quote               → insufficient (needs_review)
//   - non-material citations without a quote, or no citations at all
//                                             → evidence_absent (unknown)
export function buildResolverInputs({ policyDecision, flashSignals, verdictStatus, outOfScope, materiality, citations } = {}) {
  const material = materiality === 'high' || materiality === 'critical';
  const cits = Array.isArray(citations) ? citations : [];
  const anyUsable = cits.some((c) => c && c.fetched_ok === true);
  const anyQuote = cits.some((c) => c && c.quote_present === true);
  return {
    prohibited: policyDecision === 'block',
    injection: (Array.isArray(flashSignals) ? flashSignals : []).some((s) => s && s.category === 'prompt_injection_pattern'),
    out_of_scope: outOfScope === true,
    contradicted: verdictStatus === 'contradicted',
    unsupported: verdictStatus === 'unsupported',
    insufficient: material && cits.length > 0 && (!anyUsable || !anyQuote),
    evidence_absent: cits.length === 0 || (!material && !anyQuote),
    limited: anyQuote,
  };
}
