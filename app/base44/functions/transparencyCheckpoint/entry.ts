import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';
import { jcsCanonicalize, sha256Hex, publicKeyId } from '../../shared/canonicalSign.js';
import { generateSignature } from '../../shared/sf2xCore.js';
import { merkleRoot } from '../../shared/merkle.js';

// Signed transparency checkpoints (MASTER_PLAN v5 §10) — durable, append-only
// tree heads over the FULL warrant log. warrantRegistry computes merkle_root +
// inclusion proofs over the newest ≤500 warrants on demand; this function makes
// the log durable: it pages the ENTIRE Warrant log, computes the RFC 6962 root
// over the same ordered leaves, and persists an Ed25519-signed TreeHead chained
// to its predecessor via prev_root. Publishing heads is the point, so reads
// need no auth (transparency); only checkpoint CREATION is admin-gated (the
// keyExpirySweep gate — human admins and workflow runs alike). Heads are
// append-only: never updated, never deleted.
//
// CONSISTENCY HONESTY: v1 stores heads and prev_root chain links but does NOT
// produce RFC 6962 consistency proofs between heads — a verifier can recompute
// any single head's root from the full chain listing, and can see that heads
// link, but cannot yet prove append-only growth between two heads from the
// heads alone. Flagged as the follow-up in the response note + API_REFERENCE.

const TREEHEAD_SCHEMA = 'aether.treehead.v1';
const PAGE_SIZE = 500;
// Hard ceiling mirroring ledgerIntegrityCheck — a runaway-pager guard. A log
// larger than this fails closed (no head is created), never truncates silently.
const MAX_LEAVES = 50000;
const NOTE = 'Append-only signed tree heads over the FULL warrant log. v1 stores prev_root chain links but not RFC 6962 consistency proofs between heads — verify a head by recomputing the full-log root from the warrantRegistry chain listing, or trust-on-inclusion via a warrantRegistry inclusion proof. Consistency proofs between heads are a flagged follow-up.';

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

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;

    let user = null;
    try { user = await base44.auth.me(); } catch { /* unauthenticated — read-only path */ }
    const isAdmin = !!user && user.role === 'admin';

    // TreeHead reads are deny-by-default at the entity (AuditLog-style RLS), so
    // the published view goes through the service role here — the last 10 heads,
    // newest first.
    const heads = ((await svc.entities.TreeHead.list('-created_date', 10).catch(() => [])) || []).sort(newestFirst);
    const latest = heads[0] || null;

    if (req.method !== 'POST' || !isAdmin) {
      return Response.json({
        registry: 'sf2x_warrants',
        schema: TREEHEAD_SCHEMA,
        head: latest ? publicHead(latest) : null,
        recent_heads: heads.map(publicHead),
        note: NOTE,
      });
    }

    // Admin POST — the checkpoint path. Fail closed before any work: without
    // the Ed25519 keypair there is nothing honest to persist — an unsigned or
    // HMAC-"signed" tree head would defeat its own purpose (the aetherKeys rule).
    if (!secrets.get('ED25519_PUBLIC_KEY') || !secrets.get('ED25519_PRIVATE_KEY')) {
      return Response.json({ error: 'Ed25519 keys are not configured — refusing to publish an unattested tree head.' }, { status: 503 });
    }

    // Page the ENTIRE Warrant log — the $lte-cursor fail-closed pattern from
    // ledgerIntegrityCheck (shared/ledger.js): newest-first fetch matching the
    // platform sort, a seen-set to drop rows re-fetched across cursor-timestamp
    // boundaries, and a hard stop on any page the cursor cannot advance past.
    // `truncated` means the scan may not cover the whole log — and a checkpoint
    // over a partial log is worse than none, so it FAILS CLOSED below instead
    // of checkpointing whatever was collected.
    const rows = [];
    const seen = new Set();
    let cursor = null;
    let pagesScanned = 0;
    let truncated = false;

    while (true) {
      const pageQuery = cursor ? { created_date: { $lte: cursor } } : {};
      let page;
      try {
        page = await svc.entities.Warrant.filter(pageQuery, '-created_date', PAGE_SIZE);
      } catch {
        truncated = true;
        break;
      }
      page = page || [];
      if (!page.length) break;
      pagesScanned++;

      const fresh = page.filter((w) => w && !seen.has(w.id));
      if (!fresh.length) {
        // No progress — every returned row was already collected. A full page
        // of duplicates means the cursor cannot advance; stop rather than loop.
        if (page.length >= PAGE_SIZE) truncated = true;
        break;
      }
      if (rows.length + fresh.length > MAX_LEAVES) {
        truncated = true;
        break;
      }
      for (const w of fresh) seen.add(w.id);
      rows.push(...fresh);

      if (page.length < PAGE_SIZE) break; // short page — the log is fully scanned
      cursor = page[page.length - 1].created_date;
      if (!cursor) { truncated = true; break; } // cannot advance without a cursor date
    }

    if (truncated) {
      return Response.json({
        error: 'Full-log scan did not complete — refusing to checkpoint a partial view of the warrant log.',
        pages_scanned: pagesScanned,
        rows_collected: rows.length,
      }, { status: 503 });
    }

    // Deterministic leaf order + leaf rule — the SAME as warrantRegistry, so a
    // head is reproducible from the public chain listing alone: created_date
    // ascending with id tie-break; leaf string = signed_hash (id when unsigned).
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
      return Response.json({ unchanged: true, head: publicHead(latest), pages_scanned: pagesScanned, note: NOTE });
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

    return Response.json({ created: true, head: publicHead(created), pages_scanned: pagesScanned, note: NOTE });
  } catch (error) {
    console.error('transparencyCheckpoint error', error);
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
}
