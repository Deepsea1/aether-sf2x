/**
 * Multi-model hallucination diagnostic matrix.
 *
 * One prompt, several frontier models, every answer run through the Aether tribunal —
 * then a sentence-by-sentence map of where each model told the truth and where it did
 * not. This is the "neutral referee" view: not a single score, but *where* and *why*
 * each model failed on the same question.
 *
 * PURE + INJECTED. Nothing here reaches the network on its own. `runComparison` takes
 * a `generate` adapter (prompt → model answer) and a `verify` adapter (answer →
 * Aether verification) and orchestrates them. That keeps the whole matrix testable
 * with no vendor API keys and no spend, and it means the same engine works against
 * the live warrantApi or a fixture.
 *
 * ── THE HONESTY PROBLEM THIS FILE IS BUILT AROUND ──────────────────────────────
 * The launch audit specifies a three-colour overlay: green = verified, yellow =
 * unverified premise, red = hallucination. That palette has no colour for the most
 * common case — a sentence the tribunal simply never assessed. Painting those green
 * would turn silence into a verification claim, which is the exact failure Aether
 * exists to catch. So there is a FOURTH state, `unassessed` (grey), and it is the
 * DEFAULT. A sentence is only ever green because a supported claim maps to it.
 *
 * Claim→sentence mapping is a declared HEURISTIC, not ground truth: the tribunal
 * returns claims that paraphrase the answer rather than quote it, so matching uses
 * normalized containment first and a token-overlap threshold second. Every mapped
 * sentence records `matchConfidence` and `matchMethod` so a reader can see how the
 * link was made, and an unmatched claim is reported in `unmappedClaims` instead of
 * being silently dropped.
 */

/** Token overlap (Jaccard) at or above this maps a claim to a sentence. Declared, tunable. */
export const OVERLAP_THRESHOLD = 0.5;

/** Sentence verdict states. `unassessed` is the default — silence is not a pass. */
export const SENTENCE_STATES = Object.freeze({
  VERIFIED: 'verified',
  UNSUPPORTED: 'unsupported',
  UNASSESSED: 'unassessed',
});

/** Colours for the overlay. Grey is deliberate: it is not a soft green. */
export const STATE_COLORS = Object.freeze({
  verified: '#2eb872',
  unsupported: '#d7263d',
  unassessed: '#8a8f98',
});

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'at', 'for', 'is',
  'are', 'was', 'were', 'be', 'been', 'it', 'this', 'that', 'these', 'those', 'as',
  'by', 'with', 'from', 'their', 'they', 'you', 'your', 'all', 'according',
]);

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function contentTokens(text) {
  return new Set(normalize(text).split(' ').filter((t) => t.length > 2 && !STOP_WORDS.has(t)));
}

function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return shared / (a.size + b.size - shared);
}

/**
 * splitSentences — deterministic segmentation that keeps the original text intact.
 * Splits on sentence-final punctuation followed by whitespace, and guards the common
 * abbreviations that would otherwise cut a sentence in half. Returns the sentences
 * exactly as written (trimmed), never rewritten.
 */
export function splitSentences(text) {
  const raw = String(text || '').trim();
  if (!raw) return [];

  // Mask the periods that must NOT end a sentence. The placeholder is a control
  // character that cannot occur in real prose — a digit or word placeholder would
  // collide with the text itself and corrupt it on restore.
  const DOT = '\u0001';
  const GUARDS = ['e.g.', 'i.e.', 'etc.', 'vs.', 'Dr.', 'Mr.', 'Mrs.', 'Ms.', 'Prof.', 'No.', 'Fig.', 'Sec.'];

  let masked = raw;
  for (const g of GUARDS) {
    masked = masked.split(g).join(g.split('.').join(DOT));
  }
  // Decimals and numbered references like "Section 4.1" — mask the dot, keep it.
  masked = masked.replace(/(\d)\.(\d)/g, `$1${DOT}$2`);

  return masked
    .split(/(?<=[.!?])["')\]]*\s+/)
    .map((s) => s.split(DOT).join('.').trim())
    .filter(Boolean);
}

/**
 * classifySentences — map the tribunal's claims onto the answer's sentences.
 *
 * Returns one entry per sentence, defaulting to `unassessed`. A sentence becomes
 * `verified` or `unsupported` only when a claim maps to it; when several claims map
 * to the same sentence, an unsupported claim WINS — the worst finding on a sentence
 * is the honest one to surface.
 */
export function classifySentences(answerText, claims = []) {
  const sentences = splitSentences(answerText);
  const usableClaims = (Array.isArray(claims) ? claims : [])
    .filter((c) => c && typeof c === 'object')
    .map((c) => ({
      claim: String(c.claim ?? c.premise ?? c.text ?? '').trim(),
      supported: typeof c.supported === 'boolean' ? c.supported : null,
      notes: String(c.notes ?? c.note ?? c.reason ?? '').trim(),
    }))
    .filter((c) => c.claim);

  const entries = sentences.map((sentence) => ({
    sentence,
    state: SENTENCE_STATES.UNASSESSED,
    color: STATE_COLORS.unassessed,
    claim: null,
    notes: '',
    matchConfidence: 0,
    matchMethod: 'none',
  }));

  const mapped = new Set();

  for (const claim of usableClaims) {
    // A claim with no stated support cannot colour anything.
    if (claim.supported === null) continue;

    const claimNorm = normalize(claim.claim);
    const claimTokens = contentTokens(claim.claim);

    let bestIndex = -1;
    let bestScore = 0;
    let method = 'none';

    entries.forEach((entry, i) => {
      const sentNorm = normalize(entry.sentence);
      if (!sentNorm || !claimNorm) return;

      // 1. Containment either way — the strongest signal.
      if (sentNorm.includes(claimNorm) || claimNorm.includes(sentNorm)) {
        const score = 1;
        if (score > bestScore) {
          bestScore = score;
          bestIndex = i;
          method = 'containment';
        }
        return;
      }
      // 2. Token overlap fallback for paraphrases.
      const score = jaccard(claimTokens, contentTokens(entry.sentence));
      if (score >= OVERLAP_THRESHOLD && score > bestScore) {
        bestScore = score;
        bestIndex = i;
        method = 'token_overlap';
      }
    });

    if (bestIndex === -1) continue;

    const entry = entries[bestIndex];
    const incoming = claim.supported ? SENTENCE_STATES.VERIFIED : SENTENCE_STATES.UNSUPPORTED;
    // An unsupported finding is never overwritten by a later supported one.
    if (entry.state === SENTENCE_STATES.UNSUPPORTED && incoming === SENTENCE_STATES.VERIFIED) {
      mapped.add(claim.claim);
      continue;
    }

    entry.state = incoming;
    entry.color = STATE_COLORS[incoming];
    entry.claim = claim.claim;
    entry.notes = claim.notes;
    entry.matchConfidence = Number(bestScore.toFixed(3));
    entry.matchMethod = method;
    mapped.add(claim.claim);
  }

  const unmappedClaims = usableClaims
    .filter((c) => c.supported !== null && !mapped.has(c.claim))
    .map((c) => ({ claim: c.claim, supported: c.supported, notes: c.notes }));

  return { sentences: entries, unmappedClaims };
}

/** Count sentences by state. */
export function stateCounts(sentenceEntries) {
  const counts = { verified: 0, unsupported: 0, unassessed: 0 };
  for (const e of sentenceEntries) counts[e.state] += 1;
  return counts;
}

/**
 * buildModelRow — one model's row in the matrix.
 *
 * `reliability` is the tribunal's OWN trust score, passed through untouched. It is
 * deliberately NOT a formula of our own invention: inventing a composite would put a
 * number on the page that no measurement backs. When the verification carries no
 * score, reliability is null and `reliabilityBasis` says why.
 */
export function buildModelRow({ model, answer, verification, error = null }) {
  if (error) {
    return {
      model,
      status: 'errored',
      error: String(error),
      answer: null,
      reliability: null,
      reliabilityBasis: 'model or verification call failed',
      verdict: null,
      sentences: [],
      counts: { verified: 0, unsupported: 0, unassessed: 0 },
      unmappedClaims: [],
      warrantUrl: null,
    };
  }

  const v = verification && typeof verification === 'object' ? verification : {};
  const body = v.data && typeof v.data === 'object' ? v.data : v;
  const claims = Array.isArray(body.claims) ? body.claims : Array.isArray(body.premises) ? body.premises : [];
  const { sentences, unmappedClaims } = classifySentences(answer, claims);
  const score = typeof body.trust_score === 'number' && Number.isFinite(body.trust_score)
    ? body.trust_score
    : null;

  const id = String(body.lineage_id || body.verification_id || '').trim();
  const tribunal = String(body.tribunal_url || '').trim();

  return {
    model,
    status: 'ok',
    error: null,
    answer,
    reliability: score,
    reliabilityBasis: score === null
      ? 'the verification returned no trust score'
      : "the tribunal's own trust score for this answer",
    verdict: String(body.verdict || '').toLowerCase() || null,
    sentences,
    counts: stateCounts(sentences),
    unmappedClaims,
    warrantUrl: tribunal
      ? (tribunal.startsWith('http') ? tribunal : `https://aether.sf2x.com${tribunal.startsWith('/') ? '' : '/'}${tribunal}`)
      : id ? `https://aether.sf2x.com/verify/${id}` : null,
  };
}

/**
 * buildDiagnosticMatrix — assemble rows into the comparison view.
 *
 * `ranking` orders only the models that actually produced a score; unscored and
 * errored models are listed separately rather than sorted to the bottom as if they
 * had lost. A winner is reported only when there is a single highest score — a tie is
 * reported as a tie, not broken arbitrarily.
 */
export function buildDiagnosticMatrix({ prompt, rows, generatedAt = null }) {
  const all = Array.isArray(rows) ? rows : [];
  const scored = all.filter((r) => r.status === 'ok' && r.reliability !== null);
  const unscored = all.filter((r) => r.status === 'ok' && r.reliability === null).map((r) => r.model);
  const errored = all.filter((r) => r.status === 'errored').map((r) => ({ model: r.model, error: r.error }));

  const ranking = [...scored]
    .sort((a, b) => b.reliability - a.reliability)
    .map((r) => ({ model: r.model, reliability: r.reliability, verdict: r.verdict }));

  let winner = null;
  let tied = [];
  if (ranking.length > 0) {
    const top = ranking[0].reliability;
    const leaders = ranking.filter((r) => r.reliability === top).map((r) => r.model);
    if (leaders.length === 1) winner = leaders[0];
    else tied = leaders;
  }

  const totals = all.reduce(
    (acc, r) => {
      acc.verified += r.counts.verified;
      acc.unsupported += r.counts.unsupported;
      acc.unassessed += r.counts.unassessed;
      return acc;
    },
    { verified: 0, unsupported: 0, unassessed: 0 },
  );

  return {
    prompt,
    generatedAt,
    modelCount: all.length,
    comparedCount: scored.length,
    rows: all,
    ranking,
    winner,
    tied,
    unscored,
    errored,
    totals,
    // Stated so a reader is never left to assume the overlay is exhaustive.
    caveats: [
      'A grey (unassessed) sentence was not evaluated by the tribunal. It is not a pass.',
      'Claim-to-sentence mapping is a heuristic; each mapped sentence carries its matchConfidence and matchMethod.',
      'Reliability is the tribunal\'s own trust score, not a score computed here.',
    ],
  };
}

/**
 * MODEL_REGISTRY — the frontier models the audit names as comparison targets, with
 * the env var each needs. Nothing here implies a key is present; `availableModels`
 * decides that at call time.
 */
export const MODEL_REGISTRY = Object.freeze({
  'gpt-4o': { label: 'GPT-4o', vendor: 'openai', envKey: 'OPENAI_API_KEY' },
  'claude-sonnet-4.5': { label: 'Claude Sonnet 4.5', vendor: 'anthropic', envKey: 'ANTHROPIC_API_KEY' },
  'gemini-1.5-pro': { label: 'Gemini 1.5 Pro', vendor: 'google', envKey: 'GOOGLE_API_KEY' },
  'llama-3.1-70b': { label: 'Llama 3.1 70B', vendor: 'meta', envKey: 'GROQ_API_KEY' },
});

/**
 * availableModels — which requested models can actually run, given configured keys.
 * Returns the unavailable ones WITH the reason, so a caller can say "Gemini was
 * skipped because GOOGLE_API_KEY is not set" instead of quietly comparing three
 * models and presenting it as four.
 */
export function availableModels(requested, env = {}) {
  const ids = Array.isArray(requested) && requested.length > 0
    ? requested
    : Object.keys(MODEL_REGISTRY);

  const available = [];
  const unavailable = [];

  for (const id of ids) {
    const spec = MODEL_REGISTRY[id];
    if (!spec) {
      unavailable.push({ model: id, reason: 'unknown model id' });
      continue;
    }
    if (!String(env[spec.envKey] || '').trim()) {
      unavailable.push({ model: id, reason: `${spec.envKey} is not configured` });
      continue;
    }
    available.push(id);
  }

  return { available, unavailable };
}

/**
 * runComparison — the orchestration.
 *
 * `generate(model, prompt)` → answer string; `verify(answer, model)` → verification.
 * Both are injected, so this runs against live vendors in production and fixtures in
 * tests. A model that throws becomes an `errored` row: one vendor outage degrades the
 * matrix, it does not fail the comparison.
 */
export async function runComparison({ prompt, models, generate, verify, generatedAt = null }) {
  const text = String(prompt || '').trim();
  if (!text) throw new Error('prompt is required');
  const ids = Array.isArray(models) ? models.filter(Boolean) : [];
  if (ids.length === 0) throw new Error('at least one model is required');
  if (typeof generate !== 'function') throw new Error('generate adapter is required');
  if (typeof verify !== 'function') throw new Error('verify adapter is required');

  const rows = await Promise.all(
    ids.map(async (model) => {
      try {
        const answer = await generate(model, text);
        if (typeof answer !== 'string' || !answer.trim()) {
          return buildModelRow({ model, error: 'model returned no answer' });
        }
        const verification = await verify(answer, model);
        return buildModelRow({ model, answer, verification });
      } catch (err) {
        return buildModelRow({ model, error: err?.message || String(err) });
      }
    }),
  );

  return buildDiagnosticMatrix({ prompt: text, rows, generatedAt });
}
