// Extraction recall (MASTER_PLAN v5 §6.3) — the measurement the §18.2 gate
// refuses to unlock without.
//
// "The system is sound only over claims it extracts; a missed material claim
// silently passes everything." Every other quality number the verifier reports
// is conditional on this one: a claim that is never extracted is never
// verified, never contradicted, and never blocked — it simply passes.
//
// TWO numbers, deliberately, because they answer different questions:
//   recall             — was the gold assertion CAPTURED by some extracted unit?
//   distinct_unit_rate — did it get its OWN unit, so it receives its own verdict?
// A compound sentence ("X is SOC 2 compliant and HIPAA compliant") scores
// recall 1.0 and distinct_unit_rate 0.0: the text was captured, but the two
// assertions share one verdict, so a false claim rides along with a true one.
// Reporting only the first number would flatter the extractor on exactly the
// case §6.3 names as the weak spot.
//
// Deterministic and dependency-free: no LLM, no network, no cost — so it can be
// recomputed on every card generation instead of being a stale stored artifact.

// Words carrying no discriminating power. Kept deliberately small: dropping too
// much would let unrelated sentences "cover" a gold claim.
const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'to', 'of', 'in', 'on',
  'at', 'by', 'for', 'with', 'and', 'or', 'as', 'that', 'this', 'these', 'those', 'it', 'its',
  'our', 'we', 'you', 'your', 'their', 'they', 'has', 'have', 'had', 'will', 'can', 'from',
  'under', 'over', 'per', 'also', 'than', 'then', 'so', 'but', 'into', 'when', 'while',
]);

// Fraction of a gold claim's significant tokens that must appear in a single
// extracted claim for it to count as captured. High on purpose: at a low
// threshold an unrelated sentence sharing a few words would score as a hit, and
// this number gates whether the product may hard-block a customer's build.
const COVERAGE_THRESHOLD = 0.8;

/**
 * Lowercase, strip punctuation, drop stopwords. Numbers and units survive —
 * losing "40%" changes a claim, so it must count toward coverage.
 */
export function significantTokens(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}%$.]+/gu, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/^[.]+|[.]+$/g, ''))
    .filter((t) => t && !STOPWORDS.has(t));
}

/**
 * Does one extracted claim carry the gold assertion? Containment, not
 * similarity: the extracted unit must include ≥ COVERAGE_THRESHOLD of the gold
 * claim's significant tokens. Extra words in the extracted sentence are fine
 * (the extractor emits whole sentences); missing ones are not.
 */
export function coversGold(extractedText, goldText) {
  const gold = significantTokens(goldText);
  if (!gold.length) return false;
  const have = new Set(significantTokens(extractedText));
  const hits = gold.filter((t) => have.has(t)).length;
  return hits / gold.length >= COVERAGE_THRESHOLD;
}

const round4 = (n) => Math.round(n * 10000) / 10000;

/**
 * Score a gold corpus against an extractor.
 *
 * @param {Array<{id:string, text:string, gold_claims:string[], notes?:string}>} cases
 * @param {(text:string)=>Array<{text:string}>} extractFn
 * @returns {{recall:number|null, distinct_unit_rate:number|null, n_gold:number,
 *   n_recalled:number, n_shared_unit:number, n_cases:number,
 *   misses:Array<{case_id:string, gold:string, notes?:string}>}}
 */
export function scoreExtractionRecall(cases, extractFn) {
  const rows = Array.isArray(cases) ? cases : [];
  let nGold = 0;
  let nRecalled = 0;
  let nSharedUnit = 0;
  let nDistinct = 0;
  let nCases = 0;
  const misses = [];

  for (const c of rows) {
    if (!c || typeof c !== 'object') continue;
    const gold = Array.isArray(c.gold_claims) ? c.gold_claims.filter((g) => typeof g === 'string' && g.trim()) : [];
    if (!gold.length) continue;
    nCases++;

    let extracted = [];
    try {
      extracted = extractFn(String(c.text || '')) || [];
    } catch {
      // An extractor that throws recalls nothing — the miss is the finding.
      extracted = [];
    }
    const units = extracted.map((e) => String((e && e.text) || ''));

    // Which extracted unit (if any) carries each gold claim.
    const unitFor = gold.map((g) => units.findIndex((u) => coversGold(u, g)));

    gold.forEach((g, i) => {
      nGold++;
      const idx = unitFor[i];
      if (idx === -1) {
        misses.push({ case_id: String(c.id || '(unnamed)'), gold: g, ...(c.notes ? { notes: c.notes } : {}) });
        return;
      }
      nRecalled++;
      // Distinct = no OTHER gold claim in this case landed on the same unit.
      const shared = unitFor.filter((x) => x === idx).length > 1;
      if (shared) nSharedUnit++;
      else nDistinct++;
    });
  }

  return {
    // null, never 1.0, when nothing was measured — the capability card treats
    // null as "not measured" and fails the gate closed on it.
    recall: nGold ? round4(nRecalled / nGold) : null,
    distinct_unit_rate: nGold ? round4(nDistinct / nGold) : null,
    n_gold: nGold,
    n_recalled: nRecalled,
    n_shared_unit: nSharedUnit,
    n_cases: nCases,
    misses,
  };
}
