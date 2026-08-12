// Capability cards (MASTER_PLAN v5 §18) — measured limits, honestly generated.
// A card states what the verifier has MEASURED it can do for a domain pack —
// evaluated tasks, prohibited tasks, known limitations, and the false-pass /
// false-block / extraction-recall rates behind them. The §18.2 gate is
// symmetric: no automatic favorable high-risk decision without an active card,
// and no default hard-blocking without a measured false-block rate under the
// pack threshold. The one law throughout: a number is never fabricated —
// absent measurement is null, and null fails the gate closed.
//
// Usage (publishCalibration ops + downstream gate consumers):
//   const card = await getActiveCard(svc, 'technical-docs@1.0');   // null when none
//   const { allowed, reasons } = enforcingAllowed(card);           // §18.2, every failing reason listed
//   const cards = await generateCardData(svc);                     // [general-verify, technical-docs@1.0] row data

import { PIPELINE_VERSION } from './verdictReuse.js';
import { scoreExtractionRecall } from './extractionRecall.js';
import { EXTRACTION_GOLD_V1, EXTRACTION_GOLD_VERSION } from './extractionGold-v1.js';
import { extractClaims } from './claimExtractor.js';

// §18.1 risk tiers — the by-risk rate objects carry exactly these keys.
export const RISK_TIERS = ['low', 'moderate', 'high', 'critical'];

// §18.2 pack thresholds: default hard-blocking needs a MEASURED false-block
// rate at or under these for the high and critical tiers.
const FALSE_BLOCK_HIGH_MAX = 0.10;
const FALSE_BLOCK_CRITICAL_MAX = 0.05;

// §6.3 does not name a number, so this is a judgement stated in the open rather
// than hidden: blocking a customer's build on a verifier that finds under 80%
// of material claims is indefensible, because the claims it missed pass
// unchallenged while the ones it caught carry the authority of a gate.
export const EXTRACTION_RECALL_MIN = 0.80;

// The measured general-verify card expires so stale numbers cannot gate
// forever — regenerate from a fresh run to renew.
const GENERAL_CARD_TTL_DAYS = 90;

function isMeasured(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

// { low, moderate, high, critical } all carrying the same value — the internal
// suite is not risk-stratified, so a measured aggregate is stated per tier
// (with that limitation on the card), and unmeasured is null per tier.
function byRisk(value) {
  const out = {};
  for (const tier of RISK_TIERS) out[tier] = isMeasured(value) ? value : null;
  return out;
}

// Active = valid_from <= now < expires_at; an absent expires_at never expires.
// Fail closed on garbage: an unparseable valid_from or expires_at makes the
// card inactive — a card whose window cannot be read never gates anything.
function isActiveAt(card, nowMs) {
  if (!card) return false;
  const from = new Date(card.valid_from || '').getTime();
  if (!Number.isFinite(from) || from > nowMs) return false;
  if (card.expires_at == null || card.expires_at === '') return true;
  const exp = new Date(card.expires_at).getTime();
  return Number.isFinite(exp) && nowMs < exp;
}

// The active card for a domain pack, or null when none. Among active cards the
// newest reviewed_at wins (created_date, then id, break ties deterministically).
// A read failure is null — no card means no enforcement, never a throw.
export async function getActiveCard(svc, domainPackId) {
  const packId = String(domainPackId || '').trim();
  if (!packId) return null;
  const rows = await svc.entities.CapabilityCard.filter({ domain_pack_id: packId }, '-created_date', 50).catch(() => []);
  const now = Date.now();
  const active = (rows || []).filter((c) => isActiveAt(c, now));
  if (!active.length) return null;
  active.sort((a, b) => {
    const ar = new Date(a.reviewed_at || '').getTime() || 0;
    const br = new Date(b.reviewed_at || '').getTime() || 0;
    if (ar !== br) return br - ar;
    const ac = String(a.created_date || '');
    const bc = String(b.created_date || '');
    if (ac !== bc) return ac > bc ? -1 : 1;
    return String(a.id) > String(b.id) ? -1 : 1;
  });
  return active[0];
}

// §18.2 symmetric gate: may this card unlock default hard-blocking? Allowed
// only when the card exists, is not expired, false_block_rate_by_risk is
// MEASURED (not null) for high AND critical with high <= 0.10 and critical
// <= 0.05, and extraction_recall is MEASURED (not null). Any miss →
// allowed:false with EVERY failing reason listed, so a consumer sees the full
// distance to unlock, not just the first wall.
export function enforcingAllowed(card) {
  if (!card) {
    return { allowed: false, reasons: ['no active capability card for this domain pack'] };
  }
  const reasons = [];
  if (card.expires_at != null && card.expires_at !== '') {
    const exp = new Date(card.expires_at).getTime();
    if (!Number.isFinite(exp) || exp <= Date.now()) reasons.push('capability card is expired');
  }
  const fb = (card.false_block_rate_by_risk && typeof card.false_block_rate_by_risk === 'object') ? card.false_block_rate_by_risk : {};
  if (!isMeasured(fb.high)) reasons.push('false_block_rate_by_risk.high is not measured');
  else if (fb.high > FALSE_BLOCK_HIGH_MAX) reasons.push(`false_block_rate_by_risk.high ${fb.high} exceeds the ${FALSE_BLOCK_HIGH_MAX} threshold`);
  if (!isMeasured(fb.critical)) reasons.push('false_block_rate_by_risk.critical is not measured');
  else if (fb.critical > FALSE_BLOCK_CRITICAL_MAX) reasons.push(`false_block_rate_by_risk.critical ${fb.critical} exceeds the ${FALSE_BLOCK_CRITICAL_MAX} threshold`);
  // Extraction recall is measured AND adequate, in that order. Presence alone
  // was the original check, and measuring the shipped extractor showed why that
  // is not enough: it scored 0.4091 — fewer than half the material claims — and
  // an is-it-measured check would have accepted that as satisfied. A claim that
  // is never extracted is never verified, never contradicted, and never
  // blocked, so low recall silently voids every other number on this card.
  if (!isMeasured(card.extraction_recall)) reasons.push('extraction_recall is not measured');
  else if (card.extraction_recall < EXTRACTION_RECALL_MIN) {
    reasons.push(`extraction_recall ${card.extraction_recall} is below the ${EXTRACTION_RECALL_MIN} minimum — the majority of material claims must be found before any of them may be hard-blocked`);
  }
  return { allowed: reasons.length === 0, reasons };
}

// Build both capability cards MEASUREDLY from stored evaluation rows — never
// from a wish. Returns row data for two packs (creation is the caller's job):
//
//   general-verify     — rates computed from the latest stored negative-control
//                        run (runNegativeControls → CorrelationAudit rows whose
//                        items carry per-item class labels). False-pass proxy =
//                        FABRICATED/CORRUPTED claims that PASSED over that class
//                        count; false-block proxy = TRUE claims that FAILED over
//                        the TRUE count. THIN_NEG abstention probes belong to
//                        neither proxy. A missing caught flag counts against us
//                        (as a false pass / false block) — fail closed.
//   technical-docs@1.0 — every rate null: the wedge's deterministic path has no
//                        measured false-block rate yet, so this card
//                        deliberately fails the §18.2 gate until one exists.
//
// extraction_recall, evidence_alignment_rate and citation_integrity_rate have
// no stored measurement anywhere in the app (grounding match flags are not
// gold alignment labels), so they are null on BOTH cards — never estimated.
export async function generateCardData(svc) {
  const nowIso = new Date().toISOString();

  // §6.3 extraction recall — recomputed here rather than read from storage.
  // The extractor is deterministic and the gold corpus ships with the app, so
  // the number is reproducible from source at any time and can never go stale
  // against the extractor it describes. Wrapped: a scorer failure must leave
  // recall null (unmeasured, gate stays closed), never silently zero or high.
  let extraction = { recall: null, distinct_unit_rate: null, n_gold: 0, n_cases: 0 };
  try {
    extraction = scoreExtractionRecall(EXTRACTION_GOLD_V1, (t) => extractClaims(t));
  } catch (e) {
    console.error('extraction recall scoring failed:', e?.message || e);
  }
  const extractionLimitation = extraction.recall === null
    ? 'extraction_recall could not be computed — null, never estimated.'
    : `extraction_recall ${extraction.recall} measured on ${EXTRACTION_GOLD_VERSION} (${extraction.n_gold} material claims across ${extraction.n_cases} cases, deterministic extractor). distinct_unit_rate ${extraction.distinct_unit_rate}: the share of claims that get their OWN verification unit — the remainder share a unit with another claim and therefore share its verdict.`;
  const generalExpiry = new Date(Date.now() + GENERAL_CARD_TTL_DAYS * 86400000).toISOString();

  // Latest negative-control run: newest CorrelationAudit row whose items all
  // carry a class label (runNegativeControls output). runCorrelationAudit's
  // representative-sample rows have no class field and never qualify.
  const rows = await svc.entities.CorrelationAudit.list('-created_date', 25).catch(() => []);
  // A run is only a MEASUREMENT if every item actually ran. An item carrying an
  // `error` did not produce a verdict — it produced an outage. Measured naively,
  // a credit-exhausted run (observed live 2026-08-12: every TRUE claim errored
  // with "You have reached the limit of integrations for this month") reads as a
  // 100% false-block rate and would mint a card claiming the verifier blocks
  // everything. Skip errored runs entirely and fall through to the next clean
  // one; if none exists, every rate stays null and the §18.2 gate stays locked.
  const labeled = (rows || []).filter((r) => Array.isArray(r?.items) && r.items.length > 0
    && r.items.every((i) => typeof ((i || {}).class) === 'string'));
  const erroredSkipped = labeled.filter((r) => r.items.some((i) => (i || {}).error)).length;
  const negRun = labeled.find((r) => r.items.every((i) => !(i || {}).error)) || null;

  let falsePass = null;
  let falseBlock = null;
  let negatives = [];
  let trues = [];
  let thins = [];
  if (negRun) {
    negatives = negRun.items.filter((i) => i.class === 'FABRICATED' || i.class === 'CORRUPTED');
    trues = negRun.items.filter((i) => i.class === 'TRUE');
    thins = negRun.items.filter((i) => i.class === 'THIN_NEG');
    // caught !== true counts against us in both directions: an unlabeled
    // negative reads as passed (false pass), an unlabeled true as blocked
    // (false block). Measurement gaps make the card worse, never better.
    if (negatives.length > 0) falsePass = Number((negatives.filter((i) => i.caught !== true).length / negatives.length).toFixed(4));
    if (trues.length > 0) falseBlock = Number((trues.filter((i) => i.caught !== true).length / trues.length).toFixed(4));
  }

  const generalLimitations = negRun
    ? [
      `Measured on the internal negative-control suite only (${negRun.dataset || 'negative-control run'}, n=${negRun.items.length}: ${negatives.length} fabricated/corrupted · ${trues.length} true · ${thins.length} thin-coverage) — not an independent benchmark.`,
      'The suite is not risk-stratified: every by-risk value is the single suite-wide aggregate stated per tier, not a per-tier measurement.',
      'False-pass proxy = fabricated/corrupted claims the pipeline passed; false-block proxy = true claims it failed. Thin-coverage abstention probes are excluded from both.',
      extractionLimitation,
      'evidence_alignment_rate and citation_integrity_rate have no measurement — null, never estimated.',
      `Card expires ${GENERAL_CARD_TTL_DAYS} days after generation; regenerate from a fresh negative-control run to renew.`,
    ]
    : [
      erroredSkipped > 0
        ? `No usable negative-control run: ${erroredSkipped} stored run(s) were skipped because items carried execution errors (an incomplete run measures the outage, not the verifier). Every rate stays null until a clean run exists.`
        : 'No stored negative-control run found — every rate on this card is null until one exists. Absent measurement is never replaced with an estimate.',
      extractionLimitation,
      'evidence_alignment_rate and citation_integrity_rate have no measurement — null, never estimated.',
      `Card expires ${GENERAL_CARD_TTL_DAYS} days after generation; regenerate from a fresh negative-control run to renew.`,
    ];

  const generalVerify = {
    domain_pack_id: 'general-verify',
    verifier_version: PIPELINE_VERSION,
    evaluated_tasks: [
      'single-claim and whole-text factual verification (tribunal pipeline)',
      'fabricated-claim detection (negative-control corpus)',
      'corrupted-claim detection (negative-control corpus)',
      'thin-coverage abstention (insufficient_evidence on uncoverable claims)',
    ],
    prohibited_tasks: [
      'medical, legal, or financial determinations without human review',
      'automatic enforcement decisions while the §18.2 gate is locked',
    ],
    known_limitations: generalLimitations,
    benchmark_refs: negRun ? [negRun.id, EXTRACTION_GOLD_VERSION] : [EXTRACTION_GOLD_VERSION],
    false_pass_rate_by_risk: byRisk(falsePass),
    false_block_rate_by_risk: byRisk(falseBlock),
    extraction_recall: extraction.recall,
    evidence_alignment_rate: null,
    citation_integrity_rate: null,
    valid_from: nowIso,
    reviewed_at: nowIso,
    expires_at: generalExpiry,
  };

  const technicalDocs = {
    domain_pack_id: 'technical-docs@1.0',
    verifier_version: PIPELINE_VERSION,
    evaluated_tasks: [],
    prohibited_tasks: [
      'default hard-blocking in CI — release_gate.mode stays advisory until a measured false-block rate exists',
    ],
    known_limitations: [
      "The wedge's deterministic path has NO measured false-block rate yet — every rate on this card is null until a wedge-specific measurement exists.",
      'This card deliberately fails the §18.2 enforcing gate: advisory is the only honest mode for this pack today.',
      extractionLimitation,
    ],
    benchmark_refs: [EXTRACTION_GOLD_VERSION],
    false_pass_rate_by_risk: byRisk(null),
    false_block_rate_by_risk: byRisk(null),
    extraction_recall: extraction.recall,
    evidence_alignment_rate: null,
    citation_integrity_rate: null,
    valid_from: nowIso,
    reviewed_at: nowIso,
    expires_at: null,
  };

  return [generalVerify, technicalDocs];
}
