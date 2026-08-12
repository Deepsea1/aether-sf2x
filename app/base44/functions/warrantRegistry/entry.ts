import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';
// CLI bundling: functions are standalone — signature helpers ride inside the
// function dir (verbatim copy of sf2xCore.js's signature block; see sf2xVerify.ts).
import { verifySignature, signatureScheme } from './sf2xVerify.ts';
import { WARRANT_SCHEMA_V2, jcsCanonicalize, sha256Hex, buildWarrantV2Payload, verifyWarrantV2, signWarrantV2, publicKeyId } from '../../shared/canonicalSign.js';
import { generateSignature } from '../../shared/sf2xCore.js';
import { merkleRoot, inclusionProof, consistencyProof, MERKLE_ALGORITHM } from '../../shared/merkle.js';
import { checkEligibility } from '../../shared/displayEligibility.js';

// Public, read-only Warrant Registry — an append-only transparency log. Anyone
// can independently verify a warrant's cryptographic signature and inspect the
// chain. The chain root hash is tamper-evident: any insertion, removal, or
// modification of a warrant changes it. No auth required (transparency).
// Publishes integrity METADATA only — never warrant content (see the privacy
// boundary note at the verified_warrant block below).
//
// CONSOLIDATED OPS (the platform's 50-function cap): this function also hosts
// the parked aetherKeys + transparencyCheckpoint capabilities. body.op — or
// ?op= in the URL query string, so plain GETs work — selects 'keys' |
// 'checkpoint' | 'checkpoint_create' | 'consistency'; an unknown op is a 400
// fail-closed; no op at all is the original registry behavior below,
// unchanged. op=consistency issues RFC 6962 consistency proofs between two
// published tree heads (the append-only guarantee). op=eligibility (P4 §20) is
// the display-eligibility rail — see its block below.

async function sha256hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text ?? '')));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// The signing content varies by attestation flow (inquire vs warrantApi). Try all
// known variants so verification is robust regardless of which flow produced it.
function signingVariants(w, av) {
  const p = (w.premises || []).join(';;');
  const s = (w.sources || []).join(';;');
  const concl = w.conclusion || '';
  const ans = av.answer_text || '';
  return [
    [av.id, concl, p].join('|'),
    [av.id, ans, p, s].join('|'),
    [av.id, concl, p, s].join('|'),
    [av.id, ans, '', s].join('|'),   // warrantApi/MCP path: premises signed as empty
  ];
}

// ——— op=keys — the parked aetherKeys function (MASTER_PLAN v5 §9.3): the live
// document behind /.well-known/aether-keys.json. Publishes the current Ed25519
// verification key so anyone can check a warrant signature offline, with
// nothing from us but this document. No auth (transparency), GET or POST,
// PUBLIC key material only — the private key never leaves secrets and is only
// presence-checked here, never read.
//
// SELF-SIGNING BOOTSTRAP: payload_hash/signature sign the canonical
// { schema, keys, legacy_schemes } with the SAME key the document publishes.
// That proves transport integrity (a tampered document fails verification),
// not key authenticity — a first fetch must anchor trust in the serving
// domain + the transparency log (§10). Key rotation adds cross-signatures:
// the outgoing key signs the document that introduces its successor, so
// verifiers can walk the chain instead of re-anchoring.
async function opKeys() {
  try {
    const publicKeyPem = secrets.get('ED25519_PUBLIC_KEY');
    // Fail closed: without the keypair there is nothing honest to publish —
    // an unsigned or HMAC-"signed" key document would defeat its own purpose.
    if (!publicKeyPem || !secrets.get('ED25519_PRIVATE_KEY')) {
      return Response.json({ error: 'Ed25519 keys are not configured — key discovery is unavailable.' }, { status: 503 });
    }

    const payload = {
      schema: 'aether.keys.v1',
      keys: [
        {
          key_id: await publicKeyId(),
          algorithm: 'Ed25519',
          public_key_pem: publicKeyPem,
          status: 'active',
        },
      ],
      // Pre-v2 warrant seals that CANNOT be verified from public material:
      // HMAC verifies server-side only (publishing the key makes it forgeable)
      // and the FNV fingerprint is a content checksum, not a signature.
      legacy_schemes: ['HMAC-SHA256 server-attested', 'FNV fingerprint'],
    };

    // signWarrantV2 fails closed to null when the keys are unusable — never
    // publish an unattested (or non-Ed25519) key document.
    const signed = await signWarrantV2(payload);
    if (!signed || !String(signed.signed_hash_v2 || '').startsWith('sf2x_ed25519_')) {
      return Response.json({ error: 'Ed25519 signing unavailable — refusing to publish an unattested key document.' }, { status: 503 });
    }

    return Response.json({
      schema: payload.schema,
      generated_note: 'Self-signed bootstrap: payload_hash = SHA-256 of the RFC 8785 (JCS) canonicalization of { schema, keys, legacy_schemes }; signature = Ed25519 over the UTF-8 bytes of that hex hash, by the key this document publishes. Verifies transport integrity; anchor first-fetch trust in the domain + transparency log. Rotation adds cross-signatures from the outgoing key.',
      keys: payload.keys,
      legacy_schemes: payload.legacy_schemes,
      payload_hash: signed.payload_hash_v2,
      signature: signed.signed_hash_v2,
    });
  } catch (error) {
    console.error('warrantRegistry op=keys error', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// ——— op=checkpoint / op=checkpoint_create — the parked transparencyCheckpoint
// function (MASTER_PLAN v5 §10): durable, append-only signed tree heads over
// the FULL warrant log. The registry's merkle_root + inclusion proofs above
// cover the newest ≤500 warrants on demand; checkpoints make the log durable:
// page the ENTIRE Warrant log, compute the RFC 6962 root over the same ordered
// leaves, and persist an Ed25519-signed TreeHead chained to its predecessor
// via prev_root. Publishing heads is the point, so reads need no auth
// (transparency); only checkpoint CREATION is admin-gated (the keyExpirySweep
// gate — human admins and workflow runs alike). Heads are append-only: never
// updated, never deleted.
//
// CONSISTENCY: heads carry signed prev_root chain links, AND op=consistency
// (below) issues RFC 6962 §2.1.2 consistency proofs between any two published
// heads — so append-only growth between checkpoints is provable from the heads
// alone, not merely asserted by the link. A prev_root link says "I claim B
// follows A"; the consistency proof is what makes that claim checkable.

const TREEHEAD_SCHEMA = 'aether.treehead.v1';
const PAGE_SIZE = 500;
// Hard ceiling mirroring ledgerIntegrityCheck — a runaway-pager guard. A log
// larger than this fails closed (no head is created), never truncates silently.
const MAX_LEAVES = 50000;
const TREEHEAD_NOTE = 'Append-only signed tree heads over the FULL warrant log. Heads carry signed prev_root chain links, and op=consistency issues RFC 6962 (§2.1.2) consistency proofs between any two published heads — proving the later tree is an append of the earlier one, so append-only growth is checkable from the heads alone rather than merely asserted. Verify a head by recomputing the full-log root from the warrantRegistry chain listing, or trust-on-inclusion via a warrantRegistry inclusion proof.';

// Integrity metadata only — a TreeHead row carries no warrant content, but the
// projection keeps the surface explicit and stable for external verifiers.
function publicHead(h) {
  return {
    head_id: h.id,
    created_date: h.created_date,
    schema_version: h.schema_version || TREEHEAD_SCHEMA,
    tree_size: h.tree_size,
    merkle_root: h.merkle_root,
    prev_root: h.prev_root ?? null,
    payload_hash: h.payload_hash,
    signed_head: h.signed_head,
    key_id: h.key_id || null,
  };
}

// Deterministic head recency: created_date descending with id tie-break —
// reversing the registry's leaf comparator, for the same reason (a bare
// '-created_date' sort is not stable when timestamps collide).
function newestFirst(a, b) {
  const at = String(a.created_date || '');
  const bt = String(b.created_date || '');
  if (at !== bt) return at > bt ? -1 : 1;
  return String(a.id) > String(b.id) ? -1 : String(a.id) < String(b.id) ? 1 : 0;
}

async function opCheckpoint(req, base44, svc, op) {
  try {
    let user = null;
    try { user = await base44.auth.me(); } catch { /* unauthenticated — read-only path */ }
    const isAdmin = !!user && user.role === 'admin';

    // TreeHead reads are deny-by-default at the entity (AuditLog-style RLS), so
    // the published view goes through the service role here — the last 10 heads,
    // newest first.
    const heads = ((await svc.entities.TreeHead.list('-created_date', 10).catch(() => [])) || []).sort(newestFirst);
    const latest = heads[0] || null;

    // The parked function's admin gate, plus the op split: only the explicit
    // checkpoint_create op may create, and a non-admin (or non-POST)
    // checkpoint_create falls back to the public read — exactly the parked
    // function's behavior for the same request.
    if (op !== 'checkpoint_create' || req.method !== 'POST' || !isAdmin) {
      return Response.json({
        registry: 'sf2x_warrants',
        schema: TREEHEAD_SCHEMA,
        head: latest ? publicHead(latest) : null,
        recent_heads: heads.map(publicHead),
        note: TREEHEAD_NOTE,
      });
    }

    // Admin POST — the checkpoint path. Fail closed before any work: without
    // the Ed25519 keypair there is nothing honest to persist — an unsigned or
    // HMAC-"signed" tree head would defeat its own purpose (the aetherKeys rule).
    if (!secrets.get('ED25519_PUBLIC_KEY') || !secrets.get('ED25519_PRIVATE_KEY')) {
      return Response.json({ error: 'Ed25519 keys are not configured — refusing to publish an unattested tree head.' }, { status: 503 });
    }

    // Read the ENTIRE Warrant log in ONE request, then prove the read was
    // complete before committing to it.
    //
    // WHY NOT A CURSOR PAGER (the 2026-08-12 defect, kept as a warning): this
    // previously paged with { created_date: { $lte: cursor } }. On this
    // platform that operator returns ZERO rows — and an unsupported filter is
    // indistinguishable from "no more rows", so the loop exited believing the
    // log was fully scanned, `truncated` stayed false, and two heads were
    // published claiming tree_size 500 over a 1,548-warrant log. They committed
    // to a SLIDING newest-500 window, so each new warrant silently changed the
    // root at an unchanged size — which op=consistency then correctly reported
    // as FORK EVIDENCE. A guard that cannot detect its own blindness is not a
    // guard. Plain `filter({}, '-created_date', N)` DOES honour large N here
    // (verified: N=2000 returned all 1,548), so completeness is provable by a
    // single read plus the saturation check below.
    //
    // COMPLETENESS PROOF: request MAX_LEAVES + 1. If the result comes back
    // saturated (>= the requested limit) the log may extend past what we read,
    // so we cannot know we saw all of it — FAIL CLOSED. A checkpoint over a
    // partial log is worse than no checkpoint, because it looks like a
    // commitment and is not one.
    const rows = [];
    let pagesScanned = 0;
    let truncated = false;

    const REQUEST_LIMIT = MAX_LEAVES + 1;
    try {
      const all = (await svc.entities.Warrant.filter({}, '-created_date', REQUEST_LIMIT)) || [];
      pagesScanned = 1;
      if (all.length >= REQUEST_LIMIT) {
        // Saturated: the log is at least MAX_LEAVES + 1 rows and this read may
        // have stopped short of its true end. Refuse rather than guess.
        truncated = true;
      } else {
        // De-duplicate defensively; the platform sort is authoritative for order.
        const seen = new Set();
        for (const w of all) {
          if (!w || seen.has(w.id)) continue;
          seen.add(w.id);
          rows.push(w);
        }
      }
    } catch {
      truncated = true;
    }

    if (truncated) {
      return Response.json({
        error: 'Full-log scan did not complete — refusing to checkpoint a partial view of the warrant log.',
        pages_scanned: pagesScanned,
        rows_collected: rows.length,
      }, { status: 503 });
    }

    // Deterministic leaf order + leaf rule — the SAME as the registry path
    // below, so a head is reproducible from the public chain listing alone:
    // created_date ascending with id tie-break; leaf string = signed_hash (id
    // when unsigned).
    rows.sort((a, b) => {
      const at = String(a.created_date || '');
      const bt = String(b.created_date || '');
      if (at !== bt) return at < bt ? -1 : 1;
      return String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0;
    });
    const leaves = rows.map((w) => w.signed_hash || w.id);
    const tree_size = leaves.length;
    const merkle_root = await merkleRoot(leaves);

    if (latest && Number(latest.tree_size) === tree_size && latest.merkle_root === merkle_root) {
      return Response.json({ unchanged: true, head: publicHead(latest), pages_scanned: pagesScanned, note: TREEHEAD_NOTE });
    }

    // Self-sign the head — the aetherKeys idiom: payload_hash = SHA-256 of the
    // RFC 8785 (JCS) canonicalization of the fixed payload shape; signed_head =
    // Ed25519 over the UTF-8 bytes of that hex hash, encoded 'sf2x_ed25519_' +
    // base64url (the sf2xCore generateSignature conventions). prev_root rides
    // INSIDE the payload, so the chain link is signed, not just stored.
    const prev_root = latest ? latest.merkle_root : null;
    const payload = { schema: TREEHEAD_SCHEMA, tree_size, merkle_root, prev_root };
    const payload_hash = await sha256Hex(jcsCanonicalize(payload));
    const signed_head = await generateSignature(payload_hash, { ed25519PrivateKey: secrets.get('ED25519_PRIVATE_KEY') });
    // Fail closed — never persist a non-Ed25519 artifact (HMAC/fingerprint fallback) as a head.
    if (!String(signed_head || '').startsWith('sf2x_ed25519_')) {
      return Response.json({ error: 'Ed25519 signing unavailable — refusing to publish an unattested tree head.' }, { status: 503 });
    }

    // Append-only: heads are only ever CREATED. Existing heads are never
    // updated or deleted, even when a later scan disagrees — a disagreement is
    // itself the tamper evidence.
    const created = await svc.entities.TreeHead.create({
      schema_version: TREEHEAD_SCHEMA,
      tree_size,
      merkle_root,
      prev_root,
      payload_hash,
      signed_head,
      key_id: await publicKeyId(),
      pages_scanned: pagesScanned,
    });

    return Response.json({ created: true, head: publicHead(created), pages_scanned: pagesScanned, note: TREEHEAD_NOTE });
  } catch (error) {
    console.error('warrantRegistry checkpoint error', error);
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
}

// ——— op=consistency — RFC 6962 §2.1.2 consistency proofs between two
// published tree heads. This closes the transparency chain's weakest link.
//
// An inclusion proof proves a warrant sits under SOME root. It says nothing
// about whether that root was reached honestly: a log that rewrote history
// between two checkpoints can still hand out perfectly valid inclusion proofs
// against its new, forked root. prev_root links only record the CLAIM that
// head N+1 follows head N. A consistency proof is what makes that claim
// checkable — it proves every one of the first m leaves is byte-identical and
// in the same order in the size-n tree, i.e. the log only ever appended.
//
// Public and read-only (transparency is the whole point). Like
// checkpoint_create it pages the FULL warrant log and FAILS CLOSED on a
// truncated scan: a consistency proof over a partial view of the log would be
// a falsehood with a signature attached.
const CONSISTENCY_HEAD_SCAN = 200;
const CONSISTENCY_NOTE = [
  'This response is self-contained: verify it OFFLINE with nothing from us but the published key document (warrantRegistry?op=keys, or any pinned copy of it).',
  '(1) SIGNATURES — for each of from/to: canonicalize signing_payload per RFC 8785 (JCS), take lowercase SHA-256 hex of those bytes and check it equals payload_hash, then check signed_head (strip the "sf2x_ed25519_" prefix, base64url-decode) as an Ed25519 signature over the UTF-8 bytes of that hex string, using the public key whose key_id matches.',
  '(2) CONSISTENCY — run the RFC 9162 §2.1.4.2 fold over proof[] with first=from.tree_size, first_hash=from.root, second=to.tree_size, second_hash=to.root. If from.tree_size is an exact power of two, prepend from.root to the node list first. Hashing is RFC 6962 §2.1: leaf = SHA-256(0x00 || leaf bytes), interior = SHA-256(0x01 || left || right).',
  '(3) CONCLUSION — both signatures valid and the fold reproducing both roots proves the size-to tree is an APPEND of the size-from tree: the first from.tree_size leaves are unchanged and in the same order. It does NOT prove anything about leaves added after to.tree_size.',
  'from.tree_size === to.tree_size is the degenerate case: proof is the empty array and the two heads must simply be the same root.',
].join(' ');

// The checkpoint_create full-log paging loop, reproduced for this op (the
// single saturating read + completeness check; see the long note in
// opCheckpoint for why the old $lte cursor pager was blind on this platform).
// opCheckpoint keeps its own inline copy so its admin-gated behavior stays
// explicit — IF YOU CHANGE ONE, CHANGE BOTH. `truncated` means the read cannot
// be proven complete, and every caller must fail closed on it.
async function scanFullWarrantLog(svc) {
  const rows = [];
  let pagesScanned = 0;
  let truncated = false;

  // ONE read, then prove it was complete. Requesting MAX_LEAVES + 1 means a
  // saturated result is evidence the log may extend past what we read — which
  // is unprovable, so it fails closed rather than issuing a proof against a
  // tree we cannot show is the whole tree.
  const REQUEST_LIMIT = MAX_LEAVES + 1;
  try {
    const all = (await svc.entities.Warrant.filter({}, '-created_date', REQUEST_LIMIT)) || [];
    pagesScanned = 1;
    if (all.length >= REQUEST_LIMIT) {
      truncated = true;
    } else {
      const seen = new Set();
      for (const w of all) {
        if (!w || seen.has(w.id)) continue;
        seen.add(w.id);
        rows.push(w);
      }
    }
  } catch {
    truncated = true;
  }

  // The SAME deterministic leaf order + leaf rule as checkpoint_create and the
  // default registry path: created_date ascending with id tie-break; leaf
  // string = signed_hash (id when unsigned). Anything else would produce a
  // proof against a tree nobody else can reproduce.
  rows.sort((a, b) => {
    const at = String(a.created_date || '');
    const bt = String(b.created_date || '');
    if (at !== bt) return at < bt ? -1 : 1;
    return String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0;
  });

  return { leaves: rows.map((w) => w.signed_hash || w.id), pagesScanned, truncated };
}

// Everything an offline verifier needs for ONE head: the signed payload shape
// itself, so there is no guessing about what was canonicalized.
function headBlock(h) {
  return {
    tree_size: Number(h.tree_size),
    root: h.merkle_root,
    signed_head: h.signed_head,
    key_id: h.key_id || null,
    head_id: h.id,
    created_date: h.created_date,
    prev_root: h.prev_root ?? null,
    schema_version: h.schema_version || TREEHEAD_SCHEMA,
    payload_hash: h.payload_hash,
    signing_payload: {
      schema: h.schema_version || TREEHEAD_SCHEMA,
      tree_size: Number(h.tree_size),
      merkle_root: h.merkle_root,
      prev_root: h.prev_root ?? null,
    },
  };
}

async function opConsistency(req, svc, body) {
  try {
    // Params ride in the POST body or the query string, so a plain GET works —
    // the op-router rule (same idiom as op=eligibility).
    const params = new URL(req.url).searchParams;
    const pick = (k) => body[k] ?? params.get(k) ?? null;

    // TreeHead reads are deny-by-default at the entity, so the published view
    // goes through the service role — same as op=checkpoint.
    const heads = ((await svc.entities.TreeHead.list('-created_date', CONSISTENCY_HEAD_SCAN).catch(() => [])) || [])
      .sort(newestFirst)
      .filter((h) => Number.isFinite(Number(h.tree_size)) && h.merkle_root);
    const availableSizes = [...new Set(heads.map((h) => Number(h.tree_size)))].sort((a, b) => a - b);

    // Default when no sizes are given: the two newest heads (the question
    // people actually mean — "did the log stay append-only since last time?").
    const rawFrom = pick('from_tree_size');
    const rawTo = pick('to_tree_size');
    let fromSize = rawFrom === null || rawFrom === '' ? null : Number(rawFrom);
    let toSize = rawTo === null || rawTo === '' ? null : Number(rawTo);
    if (fromSize === null && toSize === null) {
      if (heads.length < 2) {
        return Response.json({
          error: 'Consistency needs two published tree heads; the log currently has fewer. Create a checkpoint (op=checkpoint_create, admin) or pass from_tree_size/to_tree_size explicitly.',
          available_tree_sizes: availableSizes,
          algorithm: MERKLE_ALGORITHM,
        }, { status: 400 });
      }
      toSize = Number(heads[0].tree_size);
      fromSize = Number(heads[1].tree_size);
    }
    if (!Number.isInteger(fromSize) || !Number.isInteger(toSize) || fromSize < 1 || toSize < 1) {
      return Response.json({
        error: 'from_tree_size and to_tree_size must be positive integers naming two published tree heads.',
        available_tree_sizes: availableSizes,
      }, { status: 400 });
    }
    if (fromSize > toSize) {
      return Response.json({
        error: 'from_tree_size must not exceed to_tree_size — a consistency proof runs forward, from the older tree to the newer one.',
        available_tree_sizes: availableSizes,
      }, { status: 400 });
    }

    // Resolve each head. A single tree_size carrying two DIFFERENT roots is not
    // a lookup ambiguity to paper over — it is fork evidence, so say so.
    const resolve = (size) => {
      const matches = heads.filter((h) => Number(h.tree_size) === size);
      const roots = [...new Set(matches.map((h) => h.merkle_root))];
      return { head: matches[0] || null, conflictingRoots: roots.length > 1 ? roots : null };
    };
    const fromResolved = resolve(fromSize);
    const toResolved = resolve(toSize);
    for (const [label, r, size] of [['from', fromResolved, fromSize], ['to', toResolved, toSize]]) {
      if (r.conflictingRoots) {
        return Response.json({
          error: `FORK EVIDENCE: two published heads at ${label}_tree_size ${size} carry different roots. Refusing to issue a consistency proof.`,
          tree_size: size,
          conflicting_roots: r.conflictingRoots,
        }, { status: 409 });
      }
      if (!r.head) {
        return Response.json({
          error: `No published tree head at ${label}_tree_size ${size}.`,
          available_tree_sizes: availableSizes,
        }, { status: 404 });
      }
    }

    // Page the ENTIRE warrant log and rebuild the leaves. Fails closed on a
    // truncated scan exactly like checkpoint_create.
    const { leaves, pagesScanned, truncated } = await scanFullWarrantLog(svc);
    if (truncated) {
      return Response.json({
        error: 'Full-log scan did not complete — refusing to issue a consistency proof over a partial view of the warrant log.',
        pages_scanned: pagesScanned,
        rows_collected: leaves.length,
      }, { status: 503 });
    }
    if (leaves.length < toSize) {
      return Response.json({
        error: 'The live log holds fewer leaves than the requested to_tree_size — the tree cannot be reconstructed to that size, so no proof can be issued.',
        live_tree_size: leaves.length,
        requested_to_tree_size: toSize,
        pages_scanned: pagesScanned,
      }, { status: 409 });
    }

    // Before proving anything, check that the live log actually REPRODUCES both
    // published heads. If it does not, the honest answer is the mismatch — not
    // a proof between two roots we just invented.
    const recomputedFrom = await merkleRoot(leaves.slice(0, fromSize));
    const recomputedTo = await merkleRoot(leaves.slice(0, toSize));
    const mismatches = [];
    if (recomputedFrom !== fromResolved.head.merkle_root) {
      mismatches.push({ tree_size: fromSize, published_root: fromResolved.head.merkle_root, recomputed_root: recomputedFrom });
    }
    if (recomputedTo !== toResolved.head.merkle_root) {
      mismatches.push({ tree_size: toSize, published_root: toResolved.head.merkle_root, recomputed_root: recomputedTo });
    }
    if (mismatches.length) {
      return Response.json({
        error: 'TAMPER EVIDENCE: the live warrant log does not reproduce a published tree head. Refusing to issue a consistency proof.',
        mismatches,
        live_tree_size: leaves.length,
        pages_scanned: pagesScanned,
      }, { status: 409 });
    }

    // consistencyProof returns null — never a fabricated path — for any range
    // RFC 6962 does not define. Reaching that here would mean a guard above is
    // wrong, so it is a 500, not a silent empty array.
    const proof = await consistencyProof(leaves, fromSize, toSize);
    if (proof === null) {
      return Response.json({ error: 'Consistency proof could not be constructed for the requested range.' }, { status: 500 });
    }

    return Response.json({
      registry: 'sf2x_warrants',
      schema: TREEHEAD_SCHEMA,
      from: headBlock(fromResolved.head),
      to: headBlock(toResolved.head),
      proof,
      algorithm: MERKLE_ALGORITHM,
      leaf_rule: 'Leaves are the FULL warrant log ordered by created_date ascending with id as tie-break; each leaf string is the warrant signed_hash (its id when unsigned), hashed as UTF-8 bytes.',
      log: { live_tree_size: leaves.length, pages_scanned: pagesScanned },
      verification_note: CONSISTENCY_NOTE,
    });
  } catch (error) {
    console.error('warrantRegistry op=consistency error', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// ——— op=eligibility — the §20 display-eligibility rail as a public op. A v2
// warrant binds the EXACT answer text via answer_text_sha256; this op answers
// "does the text being displayed still carry this warrant?" by hash comparison
// alone. The caller NEVER sends content — only sha256(displayed text), hashed
// per hash_recipe below — and the response is integrity metadata only, the
// same privacy boundary as the verified_warrant block in the default path
// (§9.2): no premises, conclusion, sources, claim text, or answer excerpts
// ever leave here. GET (?content_sha256=…&warrant_id=…) or POST body, no auth
// (embeds and badges re-check eligibility on render — §21.6).
const HASH_RECIPE = 'content_sha256 = lowercase SHA-256 hex over the UTF-8 bytes of the answer text AS PERSISTED on the AnswerVersion row — no trimming, no case-folding, no whitespace normalization. verifyResponse/webhookVerify persist only the first 4,000 characters (text.slice(0, 4000)): hash that slice for their warrants. inquire/warrantApi/tribunal warrants persist the full answer text (max 20,000 chars): hash it whole.';

async function opEligibility(req, svc, body) {
  try {
    // Params ride in the POST body or the query string (so a plain GET works —
    // the op-router rule above).
    const params = new URL(req.url).searchParams;
    const pick = (k) => body[k] ?? params.get(k) ?? null;

    // Normalize case at the boundary (the persisted hash is lowercase hex),
    // then fail closed on anything that is not a SHA-256 hex digest.
    const content_sha256 = String(pick('content_sha256') || '').trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(content_sha256)) {
      return Response.json({ error: 'content_sha256 is required: the 64-hex-char SHA-256 of the displayed text, computed per hash_recipe.', hash_recipe: HASH_RECIPE }, { status: 400 });
    }

    // Resolve the warrant — the same lookup ladder as the default path below
    // (warrant_id, then signed_hash, then verification_id/lineage_id), so any
    // id an API response or embed carries resolves here too.
    let w = null;
    const warrantId = pick('warrant_id');
    if (warrantId) {
      w = await svc.entities.Warrant.get(warrantId).catch(() => null);
    }
    const signedHash = pick('signed_hash');
    if (!w && signedHash) {
      const found = await svc.entities.Warrant.filter({ signed_hash: String(signedHash) }, '-created_date', 1).catch(() => []);
      w = (found && found[0]) || null;
    }
    if (!w) {
      const lid = pick('verification_id') || pick('lineage_id');
      if (lid) {
        w = await svc.entities.Warrant.get(lid).catch(() => null);
        if (!w) {
          const found = await svc.entities.Warrant.filter({ answer_version_id: lid }, '-created_date', 1).catch(() => []);
          w = (found && found[0]) || null;
        }
      }
    }
    if (!w) return Response.json({ eligible: false, reasons: ['warrant not found'] }, { status: 404 });

    // Pure verdict from the shared rail — fail closed on legacy warrants,
    // non-'valid' status, and missing/passed expiry (see displayEligibility.js).
    const verdict = checkEligibility({ warrant: w, content_sha256 });

    // INTEGRITY METADATA ONLY — the verdict, the status, the expiry, and the
    // recipe. Never warrant content (the default path's privacy boundary).
    return Response.json({
      eligible: verdict.eligible,
      reasons: verdict.reasons,
      checked: verdict.checked,
      warrant_id: w.id,
      warrant_status: w.validity_status || null,
      expires_at: w.expiry_date || null,
      hash_recipe: HASH_RECIPE,
    });
  } catch (error) {
    console.error('warrantRegistry op=eligibility error', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// ——— The public seal: how a stranger checks a warrant with nothing but this
// response and the published key document. signed_hash_v2 binds warrant CONTENT
// (conclusion, premises, sources) that this endpoint deliberately never
// publishes, so an outsider cannot reconstruct its signed bytes — signature_valid
// below is OUR verification of it, on our side of the privacy boundary. The
// public seal exists so that verdict does not have to be taken on trust: it
// signs a payload made entirely of fields published right here.
const PUBLIC_SEAL_RECIPE = [
  'Rebuild the payload EXACTLY as: {"schema":"aether.warrant.public.v1", warrant_id, answer_version_id, answer_text_sha256, conclusion_sha256, premises_sha256, sources_sha256, created_date} — every value taken verbatim from this response.',
  'Canonicalize it per RFC 8785 (JCS), take the lowercase SHA-256 hex of those bytes, and check it equals public_payload_hash.',
  'Then check public_seal (strip the "sf2x_ed25519_" prefix, base64url-decode) as an Ed25519 signature over the UTF-8 bytes of that hex STRING, using the public key whose key_id matches public_seal_key_id (fetch it from warrantRegistry?op=keys, or any pinned copy).',
  'What this proves: the issuing key committed to these hashes for this warrant id at this created_date. It does NOT reveal or prove the content behind the hashes — to check those you must already hold the text and hash it yourself.',
  'publicly_sealed=false means the warrant was issued before the public seal shipped (or with the signing key unavailable). No seal is computed at read time: a signature made now would attest what the row looks like now, which is a different and weaker claim than sealing at issuance.',
].join(' ');

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;
    const body = await req.json().catch(() => ({}));

    // Op router (function-cap consolidation): body.op first, then the URL
    // query string so a plain GET can select an op. Absent/empty op → the
    // original registry behavior below, unchanged. Unknown op → 400 (fail
    // closed, never a silent fall-through to the default listing).
    const op = body.op || new URL(req.url).searchParams.get('op') || null;
    if (op === 'keys') return await opKeys();
    if (op === 'checkpoint' || op === 'checkpoint_create') return await opCheckpoint(req, base44, svc, op);
    if (op === 'consistency') return await opConsistency(req, svc, body);
    if (op === 'eligibility') return await opEligibility(req, svc, body);
    if (op) return Response.json({ error: 'unknown op' }, { status: 400 });

    const limit = Math.min(Number(body.limit) || 100, 500);

    const warrants = await svc.entities.Warrant.list('-created_date', limit);
    // Deterministic leaf order: created_date ascending with id as tie-break —
    // reversing '-created_date' is not stable when timestamps collide, and both
    // roots below must be reproducible from the chain listing alone.
    const ascending = [...warrants].sort((a, b) => {
      const at = String(a.created_date || '');
      const bt = String(b.created_date || '');
      if (at !== bt) return at < bt ? -1 : 1;
      return String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0;
    });
    const leaves = ascending.map((w) => w.signed_hash || w.id);
    // Legacy linear root (kept for existing consumers) + the RFC 6962 Merkle
    // root over the SAME leaves (MASTER_PLAN v5 §9.3/§10): the Merkle tree
    // admits O(log n) inclusion proofs; the linear hash cannot.
    const root = await sha256hex(leaves.join('|'));
    const merkle_root = await merkleRoot(leaves);

    let verified = null;
    // Lookup accepts warrant_id, verification_id, lineage_id (answer_version_id),
    // or signed_hash (the signature artifact itself — what embeds/badges carry).
    let w = null;
    if (body.warrant_id) {
      w = await svc.entities.Warrant.get(body.warrant_id).catch(() => null);
    }
    if (!w && body.signed_hash) {
      const found = await svc.entities.Warrant.filter({ signed_hash: String(body.signed_hash) }, '-created_date', 1).catch(() => []);
      w = (found && found[0]) || null;
    }
    if (!w) {
      const lid = body.verification_id || body.lineage_id;
      if (lid) {
        w = await svc.entities.Warrant.get(lid).catch(() => null);
        if (!w) {
          const found = await svc.entities.Warrant.filter({ answer_version_id: lid }, '-created_date', 1).catch(() => []);
          w = (found && found[0]) || null;
        }
      }
    }
    if (w) {
      const av = await svc.entities.AnswerVersion.get(w.answer_version_id).catch(() => null);
      const stored = w.signed_hash || '';
      let valid = false;
      let scheme = signatureScheme(stored);
      let payloadHashV2 = null;
      // v2 first (MASTER_PLAN v5 §9.3): reconstruct the RFC 8785 canonical
      // payload FROM THE ENTITIES — not from a stored blob — and verify the
      // Ed25519 signature over its hash. Reconstruction is the point: success
      // proves the signature binds this row's persisted content. On any
      // reconstruction gap, fall through to the legacy brute-force unchanged.
      if (w.signed_hash_v2) {
        const answerTextSha256 = w.answer_text_sha256 || (av ? await sha256Hex(av.answer_text) : null);
        if (answerTextSha256) {
          const payload = buildWarrantV2Payload({
            answer_version_id: w.answer_version_id,
            answer_text_sha256: answerTextSha256,
            conclusion: w.conclusion || '',
            premises: w.premises || [],
            sources: w.sources || [],
          });
          if (await verifyWarrantV2(payload, w.signed_hash_v2)) {
            valid = true;
            scheme = 'Ed25519-JCS-v2';
            payloadHashV2 = await sha256Hex(jcsCanonicalize(payload));
          }
        }
      }
      if (!valid && av && stored) {
        const signatureKeys = { ed25519PublicKey: secrets.get('ED25519_PUBLIC_KEY'), hmacKey: secrets.get('sf2x_attestation_key') };
        for (const candidate of signingVariants(w, av)) {
          if (await verifySignature(candidate, stored, signatureKeys)) { valid = true; break; }
        }
      }
      // Inclusion proof over the SAME ordered leaf set as merkle_root above —
      // a warrant older than the current listing window gets null, never a
      // proof against a root it is not actually in.
      const leafIndex = ascending.findIndex((entry) => entry.id === w.id);
      const inclusion = leafIndex >= 0 ? await inclusionProof(leaves, leafIndex) : null;
      // PRIVACY BOUNDARY (P1 hardening — MASTER_PLAN v5 §9.2): this endpoint is
      // unauthenticated and reads via service role, so it publishes integrity
      // metadata ONLY — signature verdict, hashes, counts, tribunal roles. It
      // must never return warrant CONTENT (premises, conclusion, sources, claim
      // text, snapshots, answer/prompt excerpts): the chain below makes every
      // warrant enumerable, so content here would make every customer inquiry
      // readable without auth — the same data class as the searchClaims pr_diff
      // leak (fixed in eec0253). Full content stays on the authenticated app
      // surfaces that go through entity RLS. Follow-up: add tenant_id +
      // is_public to Warrant for owner-scoped and opted-in public detail.
      // The public-seal fields below are HASHES, NEVER CONTENT — they publish
      // commitments to the content, not the content, so the boundary holds
      // exactly as before.
      verified = {
        warrant_id: w.id,
        answer_version_id: w.answer_version_id,
        created_date: w.created_date,
        validity_status: w.validity_status,
        confidence_score: w.confidence_score,
        expiry_date: w.expiry_date || null,
        premises_count: (w.premises || []).length,
        sources_count: (w.sources || []).length,
        claims_count: (w.claims || []).length,
        issues_count: (w.issues || []).length,
        evidence_preserved: (w.source_snapshots || []).length,
        signed_hash: stored,
        signature_valid: valid,
        signature_scheme: scheme,
        // v2 metadata — the schema the payload was canonicalized under, the
        // recomputed (verified) payload hash, and which key signed it. All
        // integrity metadata, no content. Null on pre-v2 warrants.
        schema_version: scheme === 'Ed25519-JCS-v2' ? WARRANT_SCHEMA_V2 : (w.schema_version || null),
        payload_hash_v2: payloadHashV2 || w.payload_hash_v2 || null,
        key_id: w.key_id_v2 || null,
        // HMAC + fingerprint schemes verify server-side only (the key can't be
        // published without becoming forgeable) — say so instead of implying more.
        publicly_verifiable: scheme === 'Ed25519' || scheme === 'Ed25519-JCS-v2',
        signature_public_key: scheme === 'Ed25519' || scheme === 'Ed25519-JCS-v2' ? secrets.get('ED25519_PUBLIC_KEY') : null,
        // ——— The public seal (aether.warrant.public.v1). Hashes only; the
        // whole signed payload is published here, so a third party rebuilds it
        // from this response alone and checks the signature offline. Absent on
        // warrants sealed before this shipped — reported as publicly_sealed
        // false, never back-filled at read time (see PUBLIC_SEAL_RECIPE).
        answer_text_sha256: w.answer_text_sha256 || null,
        conclusion_sha256: w.conclusion_sha256 || null,
        premises_sha256: w.premises_sha256 || null,
        sources_sha256: w.sources_sha256 || null,
        public_payload_hash: w.public_payload_hash || null,
        public_seal: w.public_seal || null,
        public_seal_key_id: w.public_seal_key_id || null,
        publicly_sealed: !!(w.public_seal && w.public_payload_hash && w.answer_text_sha256 && w.conclusion_sha256 && w.premises_sha256 && w.sources_sha256 && w.created_date),
        public_seal_recipe: PUBLIC_SEAL_RECIPE,
        verifier_lineage: w.roles || [],
        support_confidence: w.support_confidence ?? null,
        detectability_confidence: w.detectability_confidence ?? null,
        verify_url: `/verify/${w.answer_version_id}`,
        inclusion_proof: inclusion,
      };
    }

    const chain = warrants.map((w) => ({
      warrant_id: w.id,
      created_date: w.created_date,
      answer_version_id: w.answer_version_id,
      validity_status: w.validity_status,
      confidence_score: w.confidence_score,
      sources_count: (w.sources || []).length,
      premises_count: (w.premises || []).length,
      signed_hash: w.signed_hash,
      evidence_preserved: (w.source_snapshots || []).length,
    }));

    return Response.json({
      registry: 'sf2x_warrants',
      root,
      merkle_root,
      tree_size: leaves.length,
      count: chain.length,
      chain,
      verified_warrant: verified,
      note: 'Append-only transparency log. Any insertion, removal, or modification of a warrant changes the root hash. Verify any warrant signature independently via warrant_id. merkle_root is the RFC 6962 tree head over the same leaves — inclusion proofs verify against it with nothing but SHA-256.',
    });
  } catch (error) {
    console.error('warrantRegistry error', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}