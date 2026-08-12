// The Cosmos graph engine — MASTER_PLAN v5 §21.2.
//
// Pure, dependency-free, node-testable. No React, no DOM, no fetch. Everything the
// /cosmos page draws comes out of `toGraph()`; everything it animates comes out of
// `createLayout()`. Both are deterministic: same input + same seed → same output, byte
// for byte. That is what makes the picture *evidence* rather than decoration — two people
// looking at the same registry see the same cosmos, and a regression is a failing test
// rather than a vibe.
//
// THE ONE RULE THAT SHAPES EVERYTHING (see `computeWeight`): a node's prominence encodes
// AUTHORITY + FRESHNESS + EPISTEMIC STATE. Never degree. Never popularity. A hairball
// where the biggest blob is "the thing most things point at" is a popularity contest
// wearing a lab coat, and it is exactly the failure mode this file exists to prevent.

import { normalizeState, stateFor } from '@/lib/design/tokens';

/* ------------------------------------------------------------------ vocabularies */

/** §21.2 node vocabulary. Closed set — `toGraph` never invents a sixteenth. */
export const NODE_TYPES = [
  'claim', 'source', 'evidence', 'warrant', 'policy', 'decision', 'question',
  'contradiction', 'gap', 'hypothesis', 'experiment', 'artifact', 'person_or_team',
  'system', 'event',
];

/** §21.2 edge vocabulary. Closed set. */
export const EDGE_TYPES = [
  'supports', 'contradicts', 'qualifies', 'derived_from', 'verified_by', 'governed_by',
  'supersedes', 'invalidates', 'depends_on', 'raises_question', 'tested_by', 'produced',
  'approved_by', 'affects',
];

const NODE_TYPE_SET = new Set(NODE_TYPES);
const EDGE_TYPE_SET = new Set(EDGE_TYPES);

/** Human labels for node types — used by the list view, the detail panel and a11y text. */
export const NODE_TYPE_LABEL = {
  claim: 'Claim',
  source: 'Source',
  evidence: 'Evidence',
  warrant: 'Warrant',
  policy: 'Policy',
  decision: 'Decision',
  question: 'Question',
  contradiction: 'Contradiction',
  gap: 'Gap',
  hypothesis: 'Hypothesis',
  experiment: 'Experiment',
  artifact: 'Artifact',
  person_or_team: 'Person or team',
  system: 'System',
  event: 'Event',
};

/**
 * Base authority by node type. This is *standing in the record*, not popularity:
 * a signed warrant outranks a loose question no matter how many things point at either.
 */
const TYPE_AUTHORITY = {
  warrant: 0.86, evidence: 0.78, source: 0.70, claim: 0.62, artifact: 0.58,
  policy: 0.74, decision: 0.66, contradiction: 0.64, system: 0.60, person_or_team: 0.56,
  event: 0.44, question: 0.36, gap: 0.34, experiment: 0.32, hypothesis: 0.24,
};

/**
 * How loudly a state should present itself. Note this is NOT "how good the news is":
 * `contested` and `unsupported` sit high because a conflict you cannot see is the most
 * expensive thing in the record. `blocked` and `unknown` sit low because they are
 * statements about the register, not about the world.
 */
const STATE_PROMINENCE = {
  contested: 1.00, unsupported: 0.94, supported: 0.82, qualified: 0.78,
  stale: 0.62, revoked: 0.58, hypothesis: 0.44, unknown: 0.40, blocked: 0.36,
};

const DAY_MS = 86400000;

/**
 * REGISTRY VOCABULARY ADAPTER — and a live gap worth fixing upstream.
 *
 * `warrant.validity_status` is an enum the backend documents as
 * `valid | weak | invalid | insufficient_evidence | contested | expired`
 * (app/src/PROJECT_SPEC.md, and the same words appear across sf2xTrust / sf2xReview /
 * Registry). `STATE_ALIASES` in tokens.js knows `contested` and `expired` but NOT the
 * other four — so a bare `normalizeState('valid')` resolves to `unknown`, and the whole
 * map would render "Not yet measured" over a log full of measured warrants.
 *
 * That is the alias table doing exactly what it promises (never upgrade a mystery into
 * support), so the fix belongs in tokens.js, not in a workaround here. Until those four
 * keys land in STATE_ALIASES, this adapter translates the registry's own words first and
 * hands everything else to `normalizeState` unchanged — so an unrecognised status still
 * degrades to `unknown` rather than to anything flattering.
 *
 * Mapping rationale, from how the rest of the app already treats these:
 *   valid                → supported   (sf2xTrust scores it 100/100 evidence)
 *   weak                 → qualified   (scored 50/100 — it holds, with limits; not refuted)
 *   invalid              → unsupported (sf2xReview files it as an unsupported_claim)
 *   insufficient_evidence→ unknown     (nobody could measure it — an honest gap)
 */
const REGISTRY_VALIDITY = {
  valid: 'supported',
  weak: 'qualified',
  invalid: 'unsupported',
  insufficient_evidence: 'unknown',
};

/** Registry status → canonical epistemic key. Unknown words fall through, never up. */
export function stateFromValidity(raw) {
  if (raw == null) return 'unknown';
  const k = String(raw).trim().toLowerCase().replace(/[\s-]+/g, '_');
  return REGISTRY_VALIDITY[k] || normalizeState(k);
}

/* ------------------------------------------------------------------ small helpers */

const clamp01 = (n) => (n < 0 ? 0 : n > 1 ? 1 : n);
const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);

function toMillis(value) {
  if (value == null) return null;
  const t = value instanceof Date ? value.getTime() : Date.parse(String(value));
  return Number.isFinite(t) ? t : null;
}

function shortId(id, head = 8, tail = 4) {
  const s = String(id || '');
  if (s.length <= head + tail + 1) return s;
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

/**
 * Freshness in [0,1] from an exponential half-life. 1 = minted just now.
 * Age is *reported*, never silently converted into doubt: the `time` lens shows this
 * number, and nothing in this file ever downgrades an epistemic state because of it.
 * Only the registry's own `validity_status` may do that.
 */
export function freshnessOf(createdAt, now = Date.now(), halfLifeDays = 90) {
  const t = toMillis(createdAt);
  if (t == null) return 0.5; // unknown age is not "old" and not "new" — it is unknown.
  const ageDays = Math.max(0, (now - t) / DAY_MS);
  return clamp01(Math.pow(0.5, ageDays / Math.max(1, halfLifeDays)));
}

/** Whole days since `createdAt`, or null when the date is unusable. */
export function ageDays(createdAt, now = Date.now()) {
  const t = toMillis(createdAt);
  if (t == null) return null;
  return Math.max(0, Math.round((now - t) / DAY_MS));
}

/* --------------------------------------------------------------------- the weight */

/**
 * PROMINENCE LAW — the load-bearing function of this whole feature.
 *
 * weight = 0.45·authority + 0.30·freshness + 0.25·stateProminence
 *
 * ENFORCEMENT, structural rather than aspirational: this function receives ONE node and
 * nothing else. It has no access to the edge list, no `degree` argument, no graph handle.
 * It is not possible to write `weight += edges.length` here without changing the
 * signature, and changing the signature will fail the harness in
 * scripts/cosmos-graph-harness.mjs, which asserts that duplicating every edge in the
 * graph leaves every weight bit-identical.
 *
 * `authority` is intrinsic standing: what kind of artifact this is, whether it carries a
 * cryptographic seal, whether its evidence was preserved, and how strong the tribunal
 * said its own grounding was. All of that is true of the node alone, sitting in a drawer,
 * with no neighbours at all.
 *
 * @param {object} node - a node with { type, state, meta }
 * @param {number} now  - epoch ms, injected so tests are not time-dependent
 * @returns {number} 0.12 … 1
 */
export function computeWeight(node, now = Date.now()) {
  const type = NODE_TYPE_SET.has(node?.type) ? node.type : 'claim';
  const state = normalizeState(node?.state);
  const meta = node?.meta || {};

  // ---- authority: intrinsic standing, never neighbours -------------------------
  let authority = TYPE_AUTHORITY[type] ?? 0.4;
  if (meta.signed) authority += 0.06;            // it carries a signature at all
  if (meta.publiclyVerifiable) authority += 0.05; // anyone can check it, not just us
  if (meta.inLog) authority += 0.05;              // committed to the transparency log
  if (meta.evidencePreserved > 0) authority += 0.04; // the evidence still exists
  if (Number.isFinite(meta.confidence)) {
    // The tribunal's own statement about how well grounded it was. A property of the
    // verification, not of how many things later cited it.
    authority += (clamp01(meta.confidence) - 0.5) * 0.12;
  }
  authority = clamp01(authority);

  // ---- freshness: how recently this was established ----------------------------
  const freshness = Number.isFinite(meta.freshness)
    ? clamp01(meta.freshness)
    : freshnessOf(meta.createdAt, now, meta.halfLifeDays || 90);

  // ---- epistemic state: how loudly it needs to be seen -------------------------
  const prominence = STATE_PROMINENCE[state] ?? 0.4;

  const w = 0.45 * authority + 0.30 * freshness + 0.25 * prominence;
  return Math.max(0.12, Math.min(1, w));
}

/** The three legal factors, exposed so the detail panel can *show its work* to the user. */
export function weightBreakdown(node, now = Date.now()) {
  const meta = node?.meta || {};
  const state = normalizeState(node?.state);
  const type = NODE_TYPE_SET.has(node?.type) ? node.type : 'claim';
  let authority = TYPE_AUTHORITY[type] ?? 0.4;
  if (meta.signed) authority += 0.06;
  if (meta.publiclyVerifiable) authority += 0.05;
  if (meta.inLog) authority += 0.05;
  if (meta.evidencePreserved > 0) authority += 0.04;
  if (Number.isFinite(meta.confidence)) authority += (clamp01(meta.confidence) - 0.5) * 0.12;
  return {
    authority: clamp01(authority),
    freshness: Number.isFinite(meta.freshness)
      ? clamp01(meta.freshness)
      : freshnessOf(meta.createdAt, now, meta.halfLifeDays || 90),
    state: STATE_PROMINENCE[state] ?? 0.4,
    total: computeWeight(node, now),
  };
}

/* ------------------------------------------------------------------- next actions */

/**
 * Law #5: no dead ends. EVERY node hands back at least one thing a human can do next.
 * The page renders these as the mandatory action row in the detail panel, so this
 * returning an empty array would be a visual-law violation — the harness asserts it never
 * does, for every node type in the vocabulary.
 *
 * @returns {Array<{label:string, to?:string, href?:string, kind:string, hint?:string}>}
 */
export function nextActionsFor(node) {
  const meta = node?.meta || {};
  const out = [];
  const warrantId = meta.warrantId || (node?.type === 'warrant' ? meta.id : null);
  const proofQ = meta.signedHash || warrantId;

  if (proofQ) {
    out.push({ kind: 'proof', label: 'Open the proof', to: `/proof?q=${encodeURIComponent(proofQ)}` });
    out.push({ kind: 'verify', label: 'Re-check the signature', to: `/warrant-proof?q=${encodeURIComponent(proofQ)}` });
  }

  switch (node?.type) {
    case 'gap':
      out.push({ kind: 'run', label: 'Run a verification to fill this gap', to: '/playground' });
      break;
    case 'contradiction':
      out.push({ kind: 'compare', label: 'Compare the conflicting records', to: '/compare' });
      break;
    case 'source':
    case 'evidence':
      if (normalizeState(node.state) === 'blocked') {
        out.push({ kind: 'access', label: 'Request access to the underlying material', to: '/contact' });
      }
      break;
    case 'policy':
      out.push({ kind: 'policy', label: 'Read what this policy permits', to: '/registry' });
      break;
    case 'system':
    case 'event':
      out.push({ kind: 'registry', label: 'Inspect the public registry', to: '/registry' });
      break;
    case 'hypothesis':
    case 'question':
    case 'experiment':
      out.push({ kind: 'run', label: 'Test it — run a verification', to: '/playground' });
      break;
    case 'claim':
      out.push({ kind: 'claim', label: 'View the published claim', to: '/public/claims' });
      break;
    default:
      break;
  }

  if (normalizeState(node?.state) === 'stale') {
    out.push({ kind: 'reverify', label: 'Re-verify to bring it back into date', to: '/playground' });
  }

  if (out.length === 0) {
    // The universal floor. Never a dead end, even for a node type we have not special-cased.
    const token = stateFor(node?.state);
    out.push({
      kind: 'run',
      label: token.nextAction || 'Run a verification',
      to: '/playground',
      hint: token.meaning,
    });
  }
  return out;
}

/* -------------------------------------------------------------------- the shaping */

function makeNode(id, type, state, label, meta, now) {
  const node = {
    id,
    type: NODE_TYPE_SET.has(type) ? type : 'claim',
    state: normalizeState(state),
    label: String(label ?? id),
    meta: meta || {},
    weight: 0,
  };
  node.weight = computeWeight(node, now);
  return node;
}

function pushEdge(edges, seen, source, target, type) {
  if (!source || !target || source === target) return;
  if (!EDGE_TYPE_SET.has(type)) return;
  const key = `${source}|${target}|${type}`;
  if (seen.has(key)) return;
  seen.add(key);
  edges.push({ source, target, type });
}

/**
 * Turn the live registry (plus whatever optional context we actually have) into the
 * epistemic map. It is aggressively honest about the shape of today's data:
 *
 *  · Warrant CONTENT is access-controlled. We are given counts, not identities, so a
 *    warrant's sources collapse to ONE `source` node in the `blocked` state that says
 *    "N sources, identities access-controlled" — never N invented source nodes.
 *  · A count of zero becomes a `gap` node with a next action, never a silent absence.
 *  · Contradictions and supersessions are only emitted when two real rows genuinely
 *    disagree or genuinely share an answer version. Nothing is inferred for drama.
 *  · Everything else — published claims, decisions, hypotheses, people — arrives through
 *    `extras` or does not arrive at all, and the lens that needs it says so out loud.
 *
 * @param {Array} registryChain - warrantRegistry `.chain` rows
 * @param {object} [extras] - { now, head, keys, capabilityCard, driftMode, publishedClaims }
 * @returns {{nodes:Array, edges:Array, meta:object}}
 */
export function toGraph(registryChain, extras = {}) {
  const now = extras.now ?? Date.now();
  const nodes = [];
  const edges = [];
  const seenEdges = new Set();
  const byId = new Map();

  const add = (node) => {
    if (byId.has(node.id)) return byId.get(node.id);
    byId.set(node.id, node);
    nodes.push(node);
    return node;
  };

  const chain = Array.isArray(registryChain) ? registryChain.filter(Boolean) : [];
  const head = extras.head || null;

  /* -- the log itself: the one system every signed warrant answers to ------------ */
  let logId = null;
  if (head || chain.some((w) => w.signed_hash)) {
    logId = 'system:transparency-log';
    const treeSize = num(head?.tree_size, chain.length);
    add(makeNode(
      logId, 'system', head ? 'supported' : 'unknown',
      'Transparency log',
      {
        kind: 'transparency-log',
        treeSize,
        merkleRoot: head?.merkle_root || null,
        createdAt: head?.created_date || null,
        signed: !!head?.signed_head,
        publiclyVerifiable: !!head?.signed_head,
        inLog: true,
        facts: [
          ['Tree size', treeSize ? `${treeSize} leaves` : 'not yet published'],
          ['Signed head', head?.signed_head ? 'yes' : 'none published'],
          ['Merkle root', head?.merkle_root ? shortId(head.merkle_root, 10, 6) : 'none published'],
        ],
      },
      now,
    ));
  }

  /* -- signing keys: who is allowed to seal a head ------------------------------- */
  for (const key of Array.isArray(extras.keys) ? extras.keys : []) {
    if (!key?.key_id) continue;
    const id = `system:key:${key.key_id}`;
    add(makeNode(
      id, 'system', key.status === 'active' ? 'supported' : 'stale',
      `Signing key · ${shortId(key.key_id, 10, 4)}`,
      {
        kind: 'signing-key',
        signed: true,
        publiclyVerifiable: true,
        createdAt: key.created_date || head?.created_date || null,
        facts: [['Algorithm', key.algorithm || 'unstated'], ['Status', key.status || 'unstated']],
      },
      now,
    ));
    if (logId && head?.key_id === key.key_id) pushEdge(edges, seenEdges, logId, id, 'approved_by');
  }

  /* -- operating mode: a real event, when the backend reports one ---------------- */
  if (extras.driftMode?.mode) {
    const id = `event:mode:${extras.driftMode.mode}`;
    add(makeNode(
      id, 'event', extras.driftMode.mode === 'normal' ? 'supported' : 'contested',
      `Operating mode · ${extras.driftMode.mode}`,
      {
        kind: 'drift-mode',
        createdAt: extras.driftMode.since || null,
        facts: [
          ['Mode', String(extras.driftMode.mode)],
          ['Since', extras.driftMode.since ? String(extras.driftMode.since).slice(0, 10) : 'unstated'],
          ['Reason', extras.driftMode.reason || 'none given'],
        ],
      },
      now,
    ));
    if (logId) pushEdge(edges, seenEdges, id, logId, 'affects');
  }

  /* -- the capability policy, when a card exists --------------------------------- */
  let policyId = null;
  if (extras.capabilityCard) {
    const card = extras.capabilityCard;
    const allowed = extras.enforcing?.allowed;
    policyId = `policy:capability:${card.domain_pack_id || 'default'}`;
    add(makeNode(
      policyId, 'policy', allowed === false ? 'blocked' : 'supported',
      `Capability policy · ${card.domain_pack_id || 'default'}`,
      {
        kind: 'capability-card',
        createdAt: card.created_date || null,
        facts: [
          ['Domain pack', card.domain_pack_id || 'default'],
          ['Enforcing', allowed === false ? 'blocking' : allowed === true ? 'permitting' : 'unstated'],
          ...(Array.isArray(extras.enforcing?.reasons) && extras.enforcing.reasons.length
            ? [['Reasons', extras.enforcing.reasons.join(' · ')]] : []),
        ],
      },
      now,
    ));
  }

  /* -- the warrants themselves ---------------------------------------------------- */
  const byAnswerVersion = new Map();

  for (const row of chain) {
    const wid = row.warrant_id;
    if (!wid) continue;
    const id = `warrant:${wid}`;
    const state = stateFromValidity(row.validity_status);
    const signed = !!row.signed_hash;
    const created = row.created_date || null;

    const warrant = add(makeNode(
      id, 'warrant', state,
      `Warrant · ${shortId(wid)}`,
      {
        kind: 'warrant',
        id: wid,
        warrantId: wid,
        signedHash: row.signed_hash || null,
        answerVersionId: row.answer_version_id || null,
        createdAt: created,
        signed,
        inLog: signed,
        publiclyVerifiable: signed,
        confidence: Number.isFinite(Number(row.confidence_score)) ? Number(row.confidence_score) : undefined,
        evidencePreserved: num(row.evidence_preserved, 0),
        sourcesCount: num(row.sources_count, 0),
        premisesCount: num(row.premises_count, 0),
        validityStatus: row.validity_status || null,
        facts: [
          ['Validity', row.validity_status || 'unstated'],
          ['Confidence', Number.isFinite(Number(row.confidence_score)) ? `${Math.round(Number(row.confidence_score) * 100)}%` : 'not scored'],
          ['Premises', String(num(row.premises_count, 0))],
          ['Sources', String(num(row.sources_count, 0))],
          ['Evidence snapshots', String(num(row.evidence_preserved, 0))],
          ['Issued', created ? String(created).slice(0, 10) : 'undated'],
        ],
      },
      now,
    ));

    if (logId && signed) pushEdge(edges, seenEdges, id, logId, 'verified_by');
    if (policyId) pushEdge(edges, seenEdges, id, policyId, 'governed_by');

    // The answer this warrant stands behind.
    if (row.answer_version_id) {
      const aid = `artifact:${row.answer_version_id}`;
      add(makeNode(
        aid, 'artifact', state,
        `Answer version · ${shortId(row.answer_version_id)}`,
        {
          kind: 'answer-version',
          id: row.answer_version_id,
          warrantId: wid,
          signedHash: row.signed_hash || null,
          createdAt: created,
          confidence: Number.isFinite(Number(row.confidence_score)) ? Number(row.confidence_score) : undefined,
          facts: [
            ['Answer version', shortId(row.answer_version_id, 14, 6)],
            ['Backed by', `warrant ${shortId(wid)}`],
            ['Content', 'access-controlled — the registry publishes metadata only'],
          ],
        },
        now,
      ));
      pushEdge(edges, seenEdges, aid, id, 'verified_by');
      const bucket = byAnswerVersion.get(row.answer_version_id) || [];
      bucket.push({ id, row, created: toMillis(created) ?? 0, state });
      byAnswerVersion.set(row.answer_version_id, bucket);
    }

    // Sources — a count, never invented identities.
    const sources = num(row.sources_count, 0);
    if (sources > 0) {
      const sid = `source:${wid}`;
      add(makeNode(
        sid, 'source', 'blocked',
        `${sources} source${sources === 1 ? '' : 's'}`,
        {
          kind: 'source-bundle',
          warrantId: wid, signedHash: row.signed_hash || null, createdAt: created, count: sources,
          facts: [
            ['Sources cited', String(sources)],
            ['Identities', 'held with the owner — the registry publishes counts only'],
          ],
        },
        now,
      ));
      pushEdge(edges, seenEdges, id, sid, 'derived_from');
    } else {
      const gid = `gap:${wid}:sources`;
      add(makeNode(
        gid, 'gap', 'unknown',
        'No sources recorded',
        {
          kind: 'gap-sources', warrantId: wid, signedHash: row.signed_hash || null, createdAt: created,
          facts: [['What is missing', 'this warrant lists no cited sources'], ['Why it matters', 'nothing external anchors the claim']],
        },
        now,
      ));
      pushEdge(edges, seenEdges, gid, id, 'qualifies');
    }

    // Preserved evidence — likewise a count.
    const snaps = num(row.evidence_preserved, 0);
    if (snaps > 0) {
      const eid = `evidence:${wid}`;
      add(makeNode(
        eid, 'evidence', 'supported',
        `${snaps} preserved snapshot${snaps === 1 ? '' : 's'}`,
        {
          kind: 'evidence-bundle',
          warrantId: wid, signedHash: row.signed_hash || null, createdAt: created,
          count: snaps, evidencePreserved: snaps,
          facts: [
            ['Snapshots preserved', String(snaps)],
            ['Why it matters', 'the cited material still exists as it was read'],
          ],
        },
        now,
      ));
      pushEdge(edges, seenEdges, eid, id, 'supports');
    } else {
      const gid = `gap:${wid}:evidence`;
      add(makeNode(
        gid, 'gap', 'unknown',
        'No evidence preserved',
        {
          kind: 'gap-evidence', warrantId: wid, signedHash: row.signed_hash || null, createdAt: created,
          facts: [
            ['What is missing', 'no snapshot of the cited material was kept'],
            ['Why it matters', 'if the source changes, this cannot be re-checked'],
          ],
        },
        now,
      ));
      pushEdge(edges, seenEdges, gid, id, 'qualifies');
    }
  }

  /* -- corrections + conflicts, derived only from rows that really collide -------- */
  for (const [answerVersionId, bucket] of byAnswerVersion) {
    if (bucket.length < 2) continue;
    const ordered = [...bucket].sort((a, b) => (a.created - b.created) || String(a.id).localeCompare(String(b.id)));
    for (let i = 1; i < ordered.length; i += 1) {
      pushEdge(edges, seenEdges, ordered[i].id, ordered[i - 1].id, 'supersedes');
    }
    const distinct = new Set(ordered.map((b) => b.state));
    // Only a real disagreement counts: two live verdicts that do not match.
    const verdicts = new Set([...distinct].filter((s) => ['supported', 'qualified', 'contested', 'unsupported'].includes(s)));
    if (verdicts.size > 1) {
      const cid = `contradiction:${answerVersionId}`;
      add(makeNode(
        cid, 'contradiction', 'contested',
        `Conflicting verdicts · ${shortId(answerVersionId)}`,
        {
          kind: 'verdict-conflict',
          createdAt: ordered[ordered.length - 1].row.created_date || null,
          warrantId: ordered[ordered.length - 1].row.warrant_id,
          signedHash: ordered[ordered.length - 1].row.signed_hash || null,
          facts: [
            ['Answer version', shortId(answerVersionId, 14, 6)],
            ['Verdicts on record', [...verdicts].join(' vs ')],
            ['Warrants involved', String(ordered.length)],
          ],
        },
        now,
      ));
      for (const b of ordered) pushEdge(edges, seenEdges, cid, b.id, 'contradicts');
    }
  }

  /* -- published claims, if public publication ever produces any ------------------ */
  for (const claim of Array.isArray(extras.publishedClaims) ? extras.publishedClaims : []) {
    const cid = `claim:${claim.id || claim.claim_id || claim.text}`;
    add(makeNode(
      cid, 'claim', claim.status || claim.verdict || 'unknown',
      claim.text || claim.title || 'Published claim',
      {
        kind: 'published-claim',
        warrantId: claim.warrant_id || null,
        createdAt: claim.created_date || null,
        facts: [['Status', String(claim.status || claim.verdict || 'unstated')]],
      },
      now,
    ));
    if (claim.warrant_id && byId.has(`warrant:${claim.warrant_id}`)) {
      pushEdge(edges, seenEdges, cid, `warrant:${claim.warrant_id}`, 'verified_by');
    }
  }

  return {
    nodes,
    edges,
    meta: {
      now,
      warrants: chain.length,
      treeSize: num(head?.tree_size, null),
      merkleRoot: head?.merkle_root || null,
      publishedClaims: Array.isArray(extras.publishedClaims) ? extras.publishedClaims.length : 0,
    },
  };
}

/* ------------------------------------------------------------------------ lenses */

/**
 * What each lens needs in order to have anything to say. A lens that finds nothing must
 * SAY SO — the page renders `reason` instead of an empty canvas, which is the difference
 * between "there is nothing here" and "this is broken".
 */
const LENS_RULES = {
  evidence: {
    line: 'Every artifact in the log, coloured by what the record actually says about it.',
    match: () => true,
    empty: 'The registry returned no warrants, so there is nothing to colour yet.',
  },
  conflict: {
    line: 'Only disagreement: conflicting verdicts and the warrants caught in them.',
    match: (n) => n.type === 'contradiction' || n.state === 'contested' || n.state === 'unsupported',
    empty: 'Nothing in the log disagrees with itself today. That is a real finding, not an empty view.',
  },
  time: {
    line: 'The same map, ranked by age. Age is shown — it never silently becomes doubt.',
    match: (n) => !!n.meta?.createdAt,
    empty: 'No artifact in the log carries a usable date, so nothing can be placed in time.',
  },
  applicability: {
    line: 'Whether a verification still applies: expiry, staleness and stated scope.',
    match: (n) => ['warrant', 'artifact', 'policy'].includes(n.type),
    empty: 'No warrants are loaded, so there is no scope to test.',
  },
  impact: {
    line: 'Downstream reach, drawn as a ring — never as node size. Size stays authority.',
    match: (n) => ['warrant', 'artifact', 'decision', 'policy', 'system'].includes(n.type),
    empty: 'Nothing downstream of a warrant has been recorded yet.',
  },
  ownership: {
    line: 'Who asserted it, who sealed it, and who could revoke it.',
    match: (n) => n.type === 'person_or_team' || n.type === 'system' || n.type === 'policy',
    empty: 'Ownership is not published today: the registry attests warrants without naming an owning team.',
  },
  unknowns: {
    line: 'The honest gaps — what was never measured and what nobody has asked.',
    match: (n) => n.type === 'gap' || n.type === 'question' || n.state === 'unknown',
    empty: 'No gaps recorded. Every warrant in the log carries sources and preserved evidence.',
  },
  risk: {
    line: 'The policy applied to each claim, and where enforcement is blocking.',
    match: (n) => n.type === 'policy' || n.type === 'event' || n.state === 'blocked' || n.state === 'revoked',
    empty: 'No capability policy or enforcement decision is published for this view yet.',
  },
  correction: {
    line: 'The record correcting itself: what superseded what, and what was withdrawn.',
    match: (n, g) => g.supersededIds.has(n.id) || n.state === 'stale' || n.state === 'revoked',
    empty: 'Nothing has been superseded or withdrawn. The log has never had to correct itself.',
  },
  opportunity: {
    line: 'Testable hypotheses and the cheapest experiment that would settle each one.',
    match: (n) => ['hypothesis', 'experiment', 'question'].includes(n.type),
    empty: 'No hypotheses are on the board. Gaps in the Unknowns lens are the cheapest place to start.',
  },
};

/** One-line statement of what a lens reveals, for the rail. */
export function lensLine(key) {
  return LENS_RULES[key]?.line || '';
}

function supersededSet(graph) {
  const s = new Set();
  for (const e of graph.edges) if (e.type === 'supersedes' || e.type === 'invalidates') { s.add(e.source); s.add(e.target); }
  return s;
}

/**
 * Apply a lens. Returns the visible subgraph plus an honest verdict about emptiness.
 * A lens NEVER re-ranks by degree; `emphasis` only ever re-mixes the three legal
 * factors from `weightBreakdown`, so the prominence law survives every lens.
 */
export function applyLens(graph, lensKey) {
  const rule = LENS_RULES[lensKey] || LENS_RULES.evidence;
  const ctx = { supersededIds: supersededSet(graph) };
  const nodes = graph.nodes.filter((n) => rule.match(n, ctx));
  const visible = new Set(nodes.map((n) => n.id));
  const edges = graph.edges.filter((e) => visible.has(e.source) && visible.has(e.target));

  // Downstream reach, computed ONCE and used only for the impact lens's annotation ring
  // and for text. It is deliberately never fed back into `weight`.
  const reach = new Map();
  if (lensKey === 'impact') {
    for (const e of graph.edges) reach.set(e.target, (reach.get(e.target) || 0) + 1);
  }

  const now = graph.meta?.now ?? Date.now();
  const ranked = nodes.map((n) => {
    const b = weightBreakdown(n, now);
    let emphasis = b.total;
    // Legal re-mixes only: each of these leans on authority / freshness / state.
    if (lensKey === 'time') emphasis = 0.25 * b.authority + 0.65 * b.freshness + 0.10 * b.state;
    else if (lensKey === 'conflict' || lensKey === 'risk') emphasis = 0.30 * b.authority + 0.10 * b.freshness + 0.60 * b.state;
    else if (lensKey === 'applicability') emphasis = 0.35 * b.authority + 0.45 * b.freshness + 0.20 * b.state;
    else if (lensKey === 'ownership') emphasis = 0.70 * b.authority + 0.15 * b.freshness + 0.15 * b.state;
    return { ...n, emphasis, reach: reach.get(n.id) || 0 };
  }).sort((a, b) => (b.emphasis - a.emphasis) || String(a.id).localeCompare(String(b.id)));

  return {
    nodes: ranked,
    edges,
    empty: ranked.length === 0,
    emptyReason: rule.empty,
    line: rule.line,
  };
}

/** Per-lens counts, so the rail can show which lenses have anything in them today. */
export function lensAvailability(graph) {
  const ctx = { supersededIds: supersededSet(graph) };
  const out = {};
  for (const [key, rule] of Object.entries(LENS_RULES)) {
    out[key] = graph.nodes.reduce((acc, n) => acc + (rule.match(n, ctx) ? 1 : 0), 0);
  }
  return out;
}

/* ------------------------------------------------------------------------ layout */

/**
 * mulberry32 — a tiny seeded PRNG. Deterministic across engines, which is the whole
 * point: the same registry always produces the same constellation, so a screenshot in a
 * bug report is reproducible.
 */
export function makeRng(seed = 1) {
  let a = (seed >>> 0) || 1;
  return function rng() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const EXACT_REPULSION_CAP = 700; // above this we switch to grid-bucketed neighbours

/**
 * A deterministic force layout. Pure in the sense that matters: no DOM, no clock, no
 * Math.random. Same graph + same options → identical Float64Arrays, every run.
 *
 * Repulsion is exact O(n²) up to EXACT_REPULSION_CAP nodes and a uniform-grid
 * approximation above it (the cheap cousin of Barnes-Hut: only nodes within the 3×3
 * neighbourhood of a cell repel, which is where all the meaningful force lives anyway).
 * Bucket contents are built in node order, so the approximation is deterministic too.
 */
export function createLayout(graph, opts = {}) {
  const {
    seed = 20260811,
    width = 1200,
    height = 780,
    linkDistance = 96,
    charge = 1500,
    gravity = 0.028,
    damping = 0.86,
    cellSize = 150,
  } = opts;

  const nodes = graph.nodes || [];
  const n = nodes.length;
  const px = new Float64Array(n);
  const py = new Float64Array(n);
  const vx = new Float64Array(n);
  const vy = new Float64Array(n);
  const mass = new Float64Array(n);

  const index = new Map();
  for (let i = 0; i < n; i += 1) index.set(nodes[i].id, i);

  const rng = makeRng(seed);
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.42;

  for (let i = 0; i < n; i += 1) {
    // Phyllotaxis seeding + a seeded jitter: an even, non-clumped start that still
    // breaks symmetry so the springs have something to work with.
    const t = (i + 0.5) / Math.max(1, n);
    const angle = i * 2.39996323 + rng() * 0.6;
    const r = radius * Math.sqrt(t) * (0.55 + rng() * 0.5);
    px[i] = cx + Math.cos(angle) * r;
    py[i] = cy + Math.sin(angle) * r;
    // Heavier = more authority = harder to shove around. Same law, expressed physically.
    mass[i] = 0.6 + (nodes[i].weight || 0.4) * 1.6;
  }

  const links = [];
  for (const e of graph.edges || []) {
    const a = index.get(e.source);
    const b = index.get(e.target);
    if (a === undefined || b === undefined || a === b) continue;
    links.push(a, b);
  }
  const linkCount = links.length / 2;

  let alpha = 1;
  const useGrid = n > EXACT_REPULSION_CAP;
  const buckets = new Map();

  function repel() {
    const k = charge * alpha;
    if (!useGrid) {
      for (let i = 0; i < n; i += 1) {
        for (let j = i + 1; j < n; j += 1) {
          let dx = px[i] - px[j];
          let dy = py[i] - py[j];
          let d2 = dx * dx + dy * dy;
          if (d2 < 0.01) { dx = (i - j) * 0.01 + 0.01; dy = 0.01; d2 = dx * dx + dy * dy; }
          if (d2 > 360000) continue; // beyond ~600px the term is noise
          const f = k / d2;
          const fx = dx * f;
          const fy = dy * f;
          vx[i] += fx / mass[i]; vy[i] += fy / mass[i];
          vx[j] -= fx / mass[j]; vy[j] -= fy / mass[j];
        }
      }
      return;
    }
    buckets.clear();
    for (let i = 0; i < n; i += 1) {
      const key = `${Math.floor(px[i] / cellSize)},${Math.floor(py[i] / cellSize)}`;
      const list = buckets.get(key);
      if (list) list.push(i); else buckets.set(key, [i]);
    }
    for (let i = 0; i < n; i += 1) {
      const gx = Math.floor(px[i] / cellSize);
      const gy = Math.floor(py[i] / cellSize);
      for (let ox = -1; ox <= 1; ox += 1) {
        for (let oy = -1; oy <= 1; oy += 1) {
          const list = buckets.get(`${gx + ox},${gy + oy}`);
          if (!list) continue;
          for (let q = 0; q < list.length; q += 1) {
            const j = list[q];
            if (j <= i) continue;
            let dx = px[i] - px[j];
            let dy = py[i] - py[j];
            let d2 = dx * dx + dy * dy;
            if (d2 < 0.01) { dx = (i - j) * 0.01 + 0.01; dy = 0.01; d2 = dx * dx + dy * dy; }
            const f = k / d2;
            const fx = dx * f;
            const fy = dy * f;
            vx[i] += fx / mass[i]; vy[i] += fy / mass[i];
            vx[j] -= fx / mass[j]; vy[j] -= fy / mass[j];
          }
        }
      }
    }
  }

  function tick(steps = 1) {
    for (let s = 0; s < steps; s += 1) {
      repel();
      for (let l = 0; l < linkCount; l += 1) {
        const i = links[l * 2];
        const j = links[l * 2 + 1];
        const dx = px[j] - px[i];
        const dy = py[j] - py[i];
        const d = Math.sqrt(dx * dx + dy * dy) || 0.001;
        const f = ((d - linkDistance) / d) * 0.07 * alpha;
        const fx = dx * f;
        const fy = dy * f;
        vx[i] += fx / mass[i]; vy[i] += fy / mass[i];
        vx[j] -= fx / mass[j]; vy[j] -= fy / mass[j];
      }
      for (let i = 0; i < n; i += 1) {
        vx[i] += (cx - px[i]) * gravity * alpha;
        vy[i] += (cy - py[i]) * gravity * alpha;
        vx[i] *= damping; vy[i] *= damping;
        px[i] += vx[i]; py[i] += vy[i];
      }
      alpha *= 0.982;
      if (alpha < 0.004) alpha = 0.004;
    }
    return alpha;
  }

  return {
    x: px,
    y: py,
    index,
    count: n,
    tick,
    alpha: () => alpha,
    /** Run to a fixed iteration count — the deterministic entry point for tests. */
    run(iterations = 200) { tick(iterations); return { x: px, y: py }; },
    /** Bounding box of the settled layout, for fit-to-view. */
    bounds() {
      if (n === 0) return { minX: 0, minY: 0, maxX: width, maxY: height };
      let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
      for (let i = 0; i < n; i += 1) {
        if (px[i] < minX) minX = px[i];
        if (px[i] > maxX) maxX = px[i];
        if (py[i] < minY) minY = py[i];
        if (py[i] > maxY) maxY = py[i];
      }
      return { minX, minY, maxX, maxY };
    },
  };
}

/** One-shot convenience: settle a graph and hand back plain coordinates. */
export function layoutPositions(graph, opts = {}, iterations = 220) {
  const sim = createLayout(graph, opts);
  sim.run(iterations);
  const out = new Map();
  for (const [id, i] of sim.index) out.set(id, { x: sim.x[i], y: sim.y[i] });
  return out;
}

export default { toGraph, computeWeight, weightBreakdown, nextActionsFor, applyLens, lensAvailability, createLayout, layoutPositions, makeRng, freshnessOf, ageDays, NODE_TYPES, EDGE_TYPES };
