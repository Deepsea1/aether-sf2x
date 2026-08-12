// Aether design tokens — the single source of truth for the epistemic visual law.
//
// THE LAW (MASTER_PLAN v5 §3.2 / §21.2 / §25.3), encoded here in data so no page can drift:
//   1. Green is only ever "supported right now, in scope". Stale, revoked, expired,
//      superseded, contested and unverified each own their own hue — never a green one,
//      not a darker green, not a desaturated one. Read the hex column: no green appears
//      below the `qualified` row.
//   2. Colour is never the only signal. Every state ships an `icon` and a `label`, and
//      <EpistemicBadge> renders both, always.
//   3. `hypothesis` is the only `dashed: true` state, and it is violet and translucent —
//      it is structurally impossible to render it like evidence.
//   4. Prominence encodes authority and freshness, never graph degree. `glow` is strongest
//      for live verdicts and weakest for the record's own bookkeeping states.
//   5. Every conflict, gap and revocation carries a `nextAction` — no dead-end visuals.
//   7. "Not yet measured" is a first-class state (`unknown`) — never a 0, never a dash.
//
// PALETTE GRAMMAR: vivid + saturated = a live verdict about the world (supported /
// qualified / contested / unsupported). Muted + low-chroma = a statement about the record,
// not the world (unknown / stale / revoked / blocked). Violet + dashed = hypothesis. The
// eye sorts judgement from bookkeeping before it reads a single word.
//
// CONTRAST — measured, not asserted. Every state hex below was computed against the card
// surface #0B0F16 using the WCAG 2.1 relative-luminance formula. All nine clear AA (4.5:1)
// for normal text; seven of the nine also clear AAA (7:1). The exact ratio travels with
// each token as `contrastOnSurface`, so a reviewer can re-run the numbers instead of
// trusting a comment:
//
//   supported 12.59 · qualified 13.24 · contested 11.50 · unsupported 7.13 · unknown 8.68
//   hypothesis 10.40 · stale 9.19 · revoked 5.45 (AA) · blocked 6.10 (AA)
//   text.primary 16.45 · text.secondary 7.49 · text.muted 5.26 · focus 11.51
//
// The three darker surfaces shift these by at most ±0.9, so a state stays legible whether
// it sits on `void`, `surface`, `raised` or `inset`. Note `text.muted` is #78879E, NOT
// Tailwind slate-500 (#64748B) — slate-500 measures 4.03:1 here and fails AA for the
// small uppercase labels this app uses it for.
//
// COLOUR VISION — also measured (Machado 2009 CVD simulation at severity 1.0, CIEDE2000).
// Of the 36 state pairs, six fall under ΔE00 10 under the worst of protan/deutan/tritan,
// and three of those effectively collapse:
//   qualified ↔ hypothesis   ΔE00 31.85 normal → 2.63 deutan
//   unsupported ↔ revoked    ΔE00 10.02 normal → 3.00 protan
//   supported ↔ qualified    ΔE00 21.43 normal → 4.18 tritan
// This is not a palette bug to be tuned away — it is the reason law #2 exists. Each of
// those pairs is separated without colour: different icons (Sparkles vs ShieldCheck,
// Ban vs ShieldX), the dashed border that only `hypothesis` may wear, the ± mark that
// only `qualified` carries, and above all the text label that <EpistemicBadge> always
// renders. Never build a view where colour is the only thing telling two states apart.

/** Deep-space surfaces. `surface` is the existing dark-card idiom (#0B0F16), unchanged. */
export const SURFACE = {
  void: '#070A0F',      // page
  surface: '#0B0F16',   // canonical card
  raised: '#111827',    // elevated card / popover / hover
  inset: '#080B11',     // wells and code blocks inside a card
  line: 'rgba(255,255,255,0.10)',
  lineStrong: 'rgba(255,255,255,0.16)',
};

/** Text scale. `muted` is #78879E (5.26:1) — NOT slate-500 #64748B, which fails AA at 4.03:1. */
export const TEXT = {
  primary: '#E8EEF7',   // 16.45:1
  secondary: '#94A3B8', //  7.49:1
  muted: '#78879E',     //  5.26:1
};

/** Focus / interaction colour. Never used as a state, so it can never read as a verdict. */
export const FOCUS = '#7DD3FC'; // 11.51:1

/**
 * The nine epistemic states.
 *   { key, label, meaning, icon, cls, hex, int, glow, dashed, nextAction, contrastOnSurface }
 * `cls` is a Tailwind text/border/bg triplet, kept as whole literal strings so the JIT
 * scanner sees them. `hex` is for CSS; `int` is the same colour as a number for
 * three.js/canvas (derived below, so the two can never drift apart).
 */
export const EPISTEMIC = {
  supported: {
    key: 'supported',
    label: 'Supported',
    meaning: 'Evidence backs this right now, inside its stated scope.',
    icon: 'ShieldCheck',
    cls: 'text-[#6EE7B7] border-[#6EE7B7]/30 bg-[#6EE7B7]/10',
    hex: '#6EE7B7',
    glow: 'rgba(110,231,183,0.30)',
    dashed: false,
    nextAction: null,
    contrastOnSurface: 12.59,
  },
  qualified: {
    key: 'qualified',
    label: 'Supported · with limits',
    meaning: 'Holds, but only under stated conditions. Read the limits before you lean on it.',
    icon: 'ShieldCheck',
    cls: 'text-[#67E8F9] border-[#67E8F9]/30 bg-[#67E8F9]/10',
    hex: '#67E8F9',
    glow: 'rgba(103,232,249,0.28)',
    dashed: false,
    nextAction: 'Read the scope limits before relying on this.',
    contrastOnSurface: 13.24,
  },
  contested: {
    key: 'contested',
    label: 'Contested',
    meaning: 'Credible sources disagree. No side has won yet.',
    icon: 'ShieldAlert',
    cls: 'text-[#FBBF24] border-[#FBBF24]/30 bg-[#FBBF24]/10',
    hex: '#FBBF24',
    glow: 'rgba(251,191,36,0.28)',
    dashed: false,
    nextAction: 'Open the conflict and compare the opposing sources.',
    contrastOnSurface: 11.50,
  },
  unsupported: {
    key: 'unsupported',
    label: 'Unsupported',
    meaning: 'The evidence does not carry this claim, or contradicts it.',
    icon: 'ShieldX',
    cls: 'text-[#FB7185] border-[#FB7185]/30 bg-[#FB7185]/10',
    hex: '#FB7185',
    glow: 'rgba(251,113,133,0.28)',
    dashed: false,
    nextAction: 'See the correction, or supply a source that would change it.',
    contrastOnSurface: 7.13,
  },
  unknown: {
    key: 'unknown',
    label: 'Not yet measured',
    meaning: 'Nobody has checked this. An honest gap — not a zero, not a pass.',
    icon: 'ShieldQuestion',
    cls: 'text-[#9FB0C6] border-[#9FB0C6]/25 bg-[#9FB0C6]/[0.07]',
    hex: '#9FB0C6',
    glow: 'rgba(159,176,198,0.16)',
    dashed: false,
    nextAction: 'Run a verification to fill this gap.',
    contrastOnSurface: 8.68,
  },
  hypothesis: {
    key: 'hypothesis',
    label: 'Hypothesis',
    meaning: 'Proposed, not evidenced. Cannot be cited as support for anything.',
    icon: 'Sparkles',
    cls: 'text-[#C4B5FD] border-[#C4B5FD]/40 bg-[#C4B5FD]/[0.06]',
    hex: '#C4B5FD',
    glow: 'rgba(196,181,253,0.22)',
    dashed: true,
    nextAction: 'Test it, or find the source that would settle it.',
    contrastOnSurface: 10.40,
  },
  stale: {
    key: 'stale',
    label: 'Stale',
    meaning: 'It held once. Its window has passed and it has not been re-checked.',
    icon: 'Clock',
    cls: 'text-[#C9B08A] border-[#C9B08A]/30 bg-[#C9B08A]/[0.08]',
    hex: '#C9B08A',
    glow: 'rgba(201,176,138,0.20)',
    dashed: false,
    nextAction: 'Re-verify to bring it back into date.',
    contrastOnSurface: 9.19,
  },
  revoked: {
    key: 'revoked',
    label: 'Revoked',
    meaning: 'Withdrawn by its owner. It no longer stands, whatever it once said.',
    icon: 'Ban',
    cls: 'text-[#C4707E] border-[#C4707E]/30 bg-[#C4707E]/[0.08]',
    hex: '#C4707E',
    glow: 'rgba(196,112,126,0.20)',
    dashed: false,
    nextAction: 'Read why it was withdrawn, then find the replacement.',
    contrastOnSurface: 5.45,
  },
  blocked: {
    key: 'blocked',
    label: 'Access-controlled',
    meaning: 'Held back, not judged. The content stays with its owner.',
    icon: 'Lock',
    cls: 'text-[#8A8FB5] border-[#8A8FB5]/30 bg-[#8A8FB5]/[0.08]',
    hex: '#8A8FB5',
    glow: 'rgba(138,143,181,0.18)',
    dashed: false,
    nextAction: 'Request access, or verify the signature without the content.',
    contrastOnSurface: 6.10,
  },
};

// Derive the numeric form once, so `hex` and `int` can never disagree.
for (const token of Object.values(EPISTEMIC)) {
  token.int = parseInt(token.hex.slice(1), 16);
}

/** Numeric surfaces for three.js (scene background, fog, depth fade). Derived, never typed twice. */
export const SURFACE_INT = {
  void: parseInt(SURFACE.void.slice(1), 16),
  surface: parseInt(SURFACE.surface.slice(1), 16),
  raised: parseInt(SURFACE.raised.slice(1), 16),
  inset: parseInt(SURFACE.inset.slice(1), 16),
};

/** Numeric focus colour — for a WebGL selection outline that must not read as a verdict. */
export const FOCUS_INT = parseInt(FOCUS.slice(1), 16);

/** Legend / iteration order: live verdicts first, then the record's own states. */
export const EPISTEMIC_ORDER = [
  'supported', 'qualified', 'contested', 'unsupported',
  'unknown', 'hypothesis', 'stale', 'revoked', 'blocked',
];

export const EPISTEMIC_LIST = EPISTEMIC_ORDER.map((k) => EPISTEMIC[k]);

/** Verdicts about the world vs. states of the record. Useful for grouping a legend. */
export const VERDICT_STATES = ['supported', 'qualified', 'contested', 'unsupported'];
export const RECORD_STATES = ['unknown', 'hypothesis', 'stale', 'revoked', 'blocked'];

/**
 * Backend vocabularies → canonical state keys. Deliberately conservative: anything this
 * map does not recognise resolves to `unknown`. It will never upgrade a mystery into
 * support — that is the whole point of having it.
 */
export const STATE_ALIASES = {
  supported: 'supported',
  verified: 'supported',
  supported_with_limits: 'qualified',
  qualified: 'qualified',
  partial: 'qualified',
  mixed: 'contested',
  contested: 'contested',
  disputed: 'contested',
  unsupported: 'unsupported',
  contradicted: 'unsupported',
  refuted: 'unsupported',
  failed: 'unsupported',
  unknown: 'unknown',
  unverified: 'unknown',
  unverifiable: 'unknown',
  pending: 'unknown',
  not_measured: 'unknown',
  out_of_scope: 'unknown',
  hypothesis: 'hypothesis',
  hypothetical: 'hypothesis',
  proposed: 'hypothesis',
  stale: 'stale',
  expired: 'stale',
  superseded: 'stale',
  outdated: 'stale',
  revoked: 'revoked',
  withdrawn: 'revoked',
  blocked: 'blocked',
  locked: 'blocked',
  restricted: 'blocked',
  access_controlled: 'blocked',
};

/** Normalise any incoming string to a canonical state key. Unrecognised → 'unknown'. */
export function normalizeState(raw) {
  if (raw == null) return 'unknown';
  const k = String(raw).trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (EPISTEMIC[k]) return k;
  return STATE_ALIASES[k] || 'unknown';
}

/** The full token for a state. Always returns a token — never undefined. */
export function stateFor(key) {
  return EPISTEMIC[key] || EPISTEMIC[normalizeState(key)];
}

/**
 * Numeric colour for canvas / three.js, which cannot read Tailwind.
 * Unknown keys resolve to the `unknown` grey rather than to anything that reads as a verdict.
 * @param {string} stateKey
 * @returns {number} 0xRRGGBB
 */
export function hexFor(stateKey) {
  return stateFor(stateKey).int;
}

/** rgba glow string for halos, bloom tints and shadows. */
export function glowFor(stateKey) {
  return stateFor(stateKey).glow;
}

/**
 * The ten Cosmos lenses (MASTER_PLAN v5 §21.2) — the ways a body of evidence can be
 * interrogated. A lens re-colours and re-weights the view; none of them is a score.
 */
export const LENS = [
  {
    key: 'evidence',
    label: 'Evidence',
    description: 'What is actually supported, and by what — coloured by epistemic state.',
    icon: 'ShieldCheck',
  },
  {
    key: 'conflict',
    label: 'Conflict',
    description: 'Where the record disagrees with itself. Everything else recedes.',
    icon: 'Swords',
  },
  {
    key: 'time',
    label: 'Time',
    description: 'How fresh each artifact is. Age is shown, never inferred as decay.',
    icon: 'Clock',
  },
  {
    key: 'applicability',
    label: 'Applicability',
    description: 'Whether a verification still applies — scope and expiry, not vibes.',
    icon: 'Crosshair',
  },
  {
    key: 'impact',
    label: 'Impact',
    description: 'Downstream reach. Size means blast radius here — never reliability.',
    icon: 'Waves',
  },
  {
    key: 'ownership',
    label: 'Ownership',
    description: 'Who asserted it, who owns the decision it backs, and who can revoke it.',
    icon: 'UserCircle',
  },
  {
    key: 'unknowns',
    label: 'Unknowns',
    description: 'The gaps: what was never measured, and what nobody has asked.',
    icon: 'ShieldQuestion',
  },
  {
    key: 'risk',
    label: 'Risk',
    description: 'Claim risk tier and the policy decision applied to it.',
    icon: 'AlertTriangle',
  },
  {
    key: 'correction',
    label: 'Correction',
    description: 'What superseded what — the record correcting itself over time.',
    icon: 'History',
  },
  {
    key: 'opportunity',
    label: 'Opportunity',
    description: 'Testable hypotheses and the cheapest experiment that would settle them.',
    icon: 'Sparkles',
  },
];

export const LENS_KEYS = LENS.map((l) => l.key);

/** Lens token by key, or null. Callers handle null rather than invent a lens. */
export function lensFor(key) {
  return LENS.find((l) => l.key === key) || null;
}

/**
 * Shared motion vocabulary, in seconds and framer-motion shaped. Consumers must still
 * gate on useReducedMotion(): reduced motion makes a state change INSTANT, it never
 * removes the state change.
 */
export const motion = {
  fast: 0.14,
  base: 0.24,
  slow: 0.5,
  spring: { type: 'spring', stiffness: 260, damping: 26 },
  ease: [0.22, 1, 0.36, 1],
};

/** Duration in seconds, collapsed to 0 when the visitor asked for reduced motion. */
export function duration(kind, reduced) {
  return reduced ? 0 : (motion[kind] ?? motion.base);
}

/** A ready-made framer-motion transition honouring the reduced-motion preference. */
export function transition(kind, reduced) {
  return { duration: duration(kind, reduced), ease: motion.ease };
}

export default {
  SURFACE, SURFACE_INT, TEXT, FOCUS, FOCUS_INT, EPISTEMIC, EPISTEMIC_ORDER, EPISTEMIC_LIST,
  VERDICT_STATES, RECORD_STATES, STATE_ALIASES, normalizeState, stateFor,
  hexFor, glowFor, LENS, LENS_KEYS, lensFor, motion, duration, transition,
};
