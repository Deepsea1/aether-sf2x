// Tamper-evident audit ledger — hash-chained, Ed25519-signed audit events.
// Every event links to the previous event via previous_event_hash, and its own
// content is hashed into event_hash. Any modification to a past event breaks
// the chain. The Ed25519 signature proves the event was issued by a trusted
// signer, not forged.
//
// Usage:
//   const entry = await buildLedgerEntry(svc, { event_type, entity_type, entity_id, actor_id, tenant_id, summary, metadata, trace_id });
//   await svc.entities.AuditLog.create(entry);
//
// Verification:
//   const ok = await verifyLedgerEntry(entry, { ed25519PublicKey });

import { generateSignature, verifySignature } from './sf2xCore.js';

async function sha256hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text ?? '')));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Canonical content for hashing — the exact fields that define the event.
// Changing any of these changes the hash, breaking the chain.
function canonicalContent(entry) {
  return JSON.stringify({
    event_type: entry.event_type,
    entity_type: entry.entity_type || '',
    entity_id: entry.entity_id || '',
    actor_id: entry.actor_id || '',
    tenant_id: entry.tenant_id || '',
    trace_id: entry.trace_id || '',
    summary: entry.summary || '',
    metadata: entry.metadata || {},
    previous_event_hash: entry.previous_event_hash || '',
  });
}

// Build a hash-chained, signed ledger entry. Fetches the previous event for the
// tenant (or globally if no tenant_id) so previous_event_hash chains correctly.
export async function buildLedgerEntry(svc, { event_type, entity_type, entity_id, actor_id, tenant_id, trace_id, summary, metadata, signingKeys }) {
  // Find the previous event in this tenant's chain (most recent by created_date).
  let previousHash = '';
  try {
    const query = tenant_id ? { tenant_id } : {};
    const prior = await svc.entities.AuditLog.filter(query, '-created_date', 1).catch(() => []);
    if (prior && prior.length && prior[0].event_hash) {
      previousHash = prior[0].event_hash;
    }
  } catch { /* first event in chain — no previous hash */ }

  const entry = {
    event_type,
    entity_type: entity_type || '',
    entity_id: entity_id || '',
    actor_id: actor_id || '',
    tenant_id: tenant_id || '',
    trace_id: trace_id || '',
    summary: summary || '',
    metadata: metadata || {},
    previous_event_hash: previousHash,
  };

  // Hash the canonical content.
  entry.event_hash = await sha256hex(canonicalContent(entry));

  // Sign the hash with Ed25519 (falls back to HMAC if no Ed25519 key).
  entry.signature = await generateSignature(entry.event_hash, signingKeys || {
    ed25519PrivateKey: (await getKeys()).ed25519PrivateKey,
  });

  entry.chain_integrity = true;
  return entry;
}

// Verify a single ledger entry — recomputes event_hash from the canonical
// content and verifies the Ed25519 signature as SEPARATE checks, so a hash
// mismatch (tampered content) is distinguishable from a signature failure
// (forged or unsigned entry). expected_hash is the hash the content actually
// produces; actual_hash is the stored event_hash. Does NOT verify chain
// continuity (use verifyLedgerChain for that).
export async function verifyLedgerEntry(entry, signingKeys) {
  if (!entry || !entry.event_hash) {
    return { valid: false, content_valid: false, signature_valid: false, expected_hash: '', actual_hash: '', reason: 'missing event_hash' };
  }
  const recomputed = await sha256hex(canonicalContent(entry));
  const contentValid = recomputed === entry.event_hash;
  // The signature is verified against the STORED event_hash string, with the
  // public key only — the private key is never loaded on the verify path.
  let signatureValid = false;
  let signatureReason = 'missing signature';
  if (entry.signature) {
    signatureValid = await verifySignature(entry.event_hash, entry.signature, signingKeys || { ed25519PublicKey: (await getKeys()).ed25519PublicKey });
    signatureReason = signatureValid ? null : 'signature verification failed';
  }
  const reasons = [];
  if (!contentValid) reasons.push('event_hash mismatch — content was modified');
  if (signatureReason) reasons.push(signatureReason);
  return {
    valid: contentValid && signatureValid,
    content_valid: contentValid,
    signature_valid: signatureValid,
    expected_hash: recomputed,
    actual_hash: entry.event_hash,
    reason: reasons.length ? reasons.join('; ') : null,
  };
}

// Verify a full chain — checks each entry's hash + signature AND that
// previous_event_hash links correctly to the prior entry. Each result row
// carries the separated verdicts (content_valid / signature_valid /
// chain_valid) so callers can tell WHICH check failed, and the summary counts
// hash vs signature failures separately.
export async function verifyLedgerChain(entries, signingKeys) {
  const results = [];
  let chainBroken = false;
  let hashFailures = 0;
  let signatureFailures = 0;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const entryCheck = await verifyLedgerEntry(e, signingKeys);
    let chainOk = true;
    if (i > 0 && e.previous_event_hash !== entries[i - 1].event_hash) {
      chainOk = false;
      chainBroken = true;
    }
    if (!entryCheck.content_valid) hashFailures++;
    if (!entryCheck.signature_valid) signatureFailures++;
    const reasons = [];
    if (entryCheck.reason) reasons.push(entryCheck.reason);
    if (!chainOk) reasons.push('previous_event_hash does not match the prior entry — chain link broken');
    results.push({
      event_id: e.id,
      event_type: e.event_type,
      content_valid: entryCheck.content_valid,
      signature_valid: entryCheck.signature_valid,
      chain_valid: chainOk,
      // The hash pair is only diagnostic when the content check failed.
      ...(entryCheck.content_valid ? {} : { expected_hash: entryCheck.expected_hash, actual_hash: entryCheck.actual_hash }),
      reason: reasons.length ? reasons.join('; ') : null,
    });
  }
  return {
    entries_checked: entries.length,
    all_valid: results.every((r) => r.content_valid && r.signature_valid && r.chain_valid),
    chain_broken: chainBroken,
    hash_failures: hashFailures,
    signature_failures: signatureFailures,
    results,
  };
}

// Integrity check — scans the ledger for any broken links or modified entries.
// Pages through AuditLog by created_date cursor (newest-first fetch, matching
// the platform's '-created_date' sort) so ledgers larger than one page still
// get scanned, up to max_entries. Pages are buffered and reversed to
// chronological order before verification, so previous_event_hash continuity
// is checked ACROSS page boundaries, not just within one page. Returns a
// summary suitable for the Trust Center or an admin dashboard; `truncated` is
// set whenever the scan may not have covered the whole ledger — a partial
// scan is never reported as a full one.
export async function ledgerIntegrityCheck(svc, { tenant_id, max_entries = 5000 } = {}) {
  const query = tenant_id ? { tenant_id } : {};
  const PAGE_SIZE = 500;
  // Hard ceiling so a caller-supplied max_entries can't become an unbounded fetch loop.
  const max = Math.min(Math.max(1, Math.floor(Number(max_entries) || 5000)), 50000);

  const entries = [];
  const seen = new Set(); // ids already collected — $lte re-fetches rows sharing the cursor timestamp
  let cursor = null;      // oldest created_date collected so far
  let pagesScanned = 0;
  let truncated = false;

  while (entries.length < max) {
    const pageQuery = cursor ? { ...query, created_date: { $lte: cursor } } : query;
    let page;
    try {
      page = await svc.entities.AuditLog.filter(pageQuery, '-created_date', PAGE_SIZE);
    } catch {
      // Fetch failed mid-scan — report what was covered, never claim a full scan.
      truncated = true;
      break;
    }
    page = page || [];
    if (!page.length) break;
    pagesScanned++;

    const fresh = page.filter((e) => e && !seen.has(e.id));
    if (!fresh.length) {
      // No progress — every returned row was already collected. A full page of
      // duplicates means the cursor cannot advance (or the range filter is not
      // narrowing); stop and report a partial scan rather than loop.
      if (page.length >= PAGE_SIZE) truncated = true;
      break;
    }

    const capacity = max - entries.length;
    if (fresh.length > capacity) {
      entries.push(...fresh.slice(0, capacity));
      truncated = true;
      break;
    }
    for (const e of fresh) seen.add(e.id);
    entries.push(...fresh);

    if (page.length < PAGE_SIZE) break; // short page — the ledger is fully scanned
    cursor = page[page.length - 1].created_date;
    if (!cursor) { truncated = true; break; } // cannot advance without a cursor date
    if (entries.length >= max) { truncated = true; break; } // more pages likely remain
  }

  if (!entries.length) return { status: 'empty', entries_checked: 0, broken: 0, pages_scanned: pagesScanned, truncated };
  // Reverse to chronological order for chain verification — the concatenated
  // pages run newest→oldest, so one reverse restores chain order end-to-end.
  const chain = entries.reverse();
  const check = await verifyLedgerChain(chain);
  const bad = check.results.filter((r) => !r.content_valid || !r.signature_valid || !r.chain_valid);
  return {
    status: check.all_valid ? 'intact' : 'broken',
    entries_checked: check.entries_checked,
    broken: bad.length,
    hash_failures: check.hash_failures,
    signature_failures: check.signature_failures,
    pages_scanned: pagesScanned,
    truncated,
    details: bad,
  };
}

// Lazy key accessor — avoids importing secrets at module load.
let _keys = null;
async function getKeys() {
  if (_keys) return _keys;
  const { secrets } = await import('base44:runtime');
  _keys = {
    ed25519PrivateKey: secrets.get('ED25519_PRIVATE_KEY'),
    ed25519PublicKey: secrets.get('ED25519_PUBLIC_KEY'),
  };
  return _keys;
}