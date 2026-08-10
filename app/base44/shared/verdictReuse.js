// Verdict memoization — exact-hash reuse of tribunal verdicts (MASTER_PLAN v5
// §7.2). Replaces verifyResponse's prefix cache key (text.slice(0, 2000)),
// which let two long texts sharing their first 2000 chars serve each other's
// verdicts. The reuse key is the SHA-256 of the RFC 8785 canonical JSON of the
// FULL key material — text hash (or normalized claim text), domain/policy,
// effective model (including the BYOK distinction), and pipeline version — so
// a hit is only ever an exact re-run of the same verification. Records live in
// the VerdictReuse entity (deny-by-default RLS, service-role internal only)
// with a TTL; expired records read as absent.
//
// Usage (verifyResponse-shaped endpoints):
//   const reuseKey = await textReuseKey({ text_sha256: await sha256Hex(text), domain, model, pipeline_version: PIPELINE_VERSION });
//   const hit = await lookupVerdict(svc, reuseKey);          // null when absent OR expired
//   if (hit) { await recordHit(svc, hit); return hit.payload; }
//   ...run the pipeline...
//   await storeVerdict(svc, { reuse_key: reuseKey, kind: 'text', payload: out, pipeline_version: PIPELINE_VERSION, model });

import { jcsCanonicalize, sha256Hex } from './canonicalSign.js';

// Matches verifyResponse's tribunal_version. Folded into every reuse key, so
// bumping it invalidates the whole cache in one place — keep it in lockstep
// with the pipeline (prompt, guardrails, scoring) whenever the tribunal evolves.
export const PIPELINE_VERSION = '2.1.0-hr-guardrails';

// Reuse key for a whole-text verification. text_sha256 hashes the FULL text
// (never a prefix — that is the collision bug this module fixes).
export async function textReuseKey({ text_sha256, domain, model, pipeline_version }) {
  return sha256Hex(jcsCanonicalize({ kind: 'text', text_sha256, domain, model, pipeline_version }));
}

// Reuse key for a single-claim verdict. claim_text is normalized (trimmed,
// whitespace collapsed) so cosmetic spacing differences share a verdict;
// policy_hash pins the policy the claim was judged against.
export async function claimReuseKey({ claim_text, policy_hash, model, pipeline_version }) {
  const claim = String(claim_text ?? '').trim().replace(/\s+/g, ' ');
  return sha256Hex(jcsCanonicalize({ kind: 'claim', claim_text: claim, policy_hash, model, pipeline_version }));
}

// TTL gate — fail closed: a record with a missing or unparseable expires_at is
// treated as expired, never served.
function isLive(record) {
  if (!record || !record.expires_at) return false;
  const t = new Date(record.expires_at).getTime();
  return Number.isFinite(t) && t > Date.now();
}

// Newest record for the key, or null when absent OR expired. A broken cache
// read is a miss, never a failure — the caller falls through to the pipeline.
export async function lookupVerdict(svc, reuse_key) {
  if (!reuse_key) return null;
  const rows = await svc.entities.VerdictReuse.filter({ reuse_key }, '-created_date', 1).catch(() => []);
  const rec = rows && rows[0];
  return isLive(rec) ? rec : null;
}

// Batch lookup — Map of reuse_key -> live record (missing/expired keys are
// simply absent). No sibling in this repo exercises the $in filter operator,
// so it is unproven on this platform: the $in attempt is tried first and any
// throw falls back to sequential lookupVerdict gets. Per-key semantics match
// the singular lookup exactly: the NEWEST record decides — if it is expired
// the key is a miss, even if an older longer-TTL record survives.
export async function lookupVerdicts(svc, reuse_keys) {
  const keys = [...new Set((Array.isArray(reuse_keys) ? reuse_keys : []).filter(Boolean))];
  const found = new Map();
  if (!keys.length) return found;
  try {
    const rows = await svc.entities.VerdictReuse.filter({ reuse_key: { $in: keys } }, '-created_date', keys.length * 4);
    const decided = new Set();
    for (const rec of rows || []) {
      if (!rec || decided.has(rec.reuse_key)) continue; // newest-first sort — the first row per key decides
      decided.add(rec.reuse_key);
      if (isLive(rec)) found.set(rec.reuse_key, rec);
    }
    return found;
  } catch {
    /* $in unsupported (or the batch fetch failed) — sequential fallback below */
  }
  for (const key of keys) {
    const rec = await lookupVerdict(svc, key);
    if (rec) found.set(key, rec);
  }
  return found;
}

// Persist a successful verdict for reuse. Never stores errors — a cached
// failure would replay for the whole TTL — and a store failure never breaks
// the request (the verdict was already computed; the cache just stays cold).
export async function storeVerdict(svc, { reuse_key, kind, payload, pipeline_version, model, ttl_days = 7 }) {
  if (!reuse_key || !kind || !payload || typeof payload !== 'object') return;
  if (payload.error) return;
  const days = Number.isFinite(Number(ttl_days)) && Number(ttl_days) > 0 ? Number(ttl_days) : 7;
  try {
    await svc.entities.VerdictReuse.create({
      reuse_key,
      kind,
      payload,
      pipeline_version,
      model,
      expires_at: new Date(Date.now() + days * 86400000).toISOString(),
      hit_count: 0,
    });
  } catch (e) { console.error('storeVerdict failed', e?.message || e); }
}

// Best-effort hit accounting — increments hit_count, never throws, never
// affects the caller's response.
export async function recordHit(svc, record) {
  if (!record || !record.id) return;
  try {
    await svc.entities.VerdictReuse.update(record.id, { hit_count: (Number(record.hit_count) || 0) + 1 });
  } catch { /* hit accounting is observability only */ }
}
