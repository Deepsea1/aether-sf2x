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

// Verify a single ledger entry — checks that event_hash matches the content
// and that the signature is valid. Does NOT verify chain continuity (use
// verifyLedgerChain for that).
export async function verifyLedgerEntry(entry, signingKeys) {
  if (!entry || !entry.event_hash) return { valid: false, reason: 'missing event_hash' };
  const recomputed = await sha256hex(canonicalContent(entry));
  if (recomputed !== entry.event_hash) return { valid: false, reason: 'event_hash mismatch — content was modified' };
  if (!entry.signature) return { valid: false, reason: 'missing signature' };
  const sigOk = await verifySignature(entry.event_hash, entry.signature, signingKeys || { ed25519PublicKey: (await getKeys()).ed25519PublicKey });
  return { valid: sigOk, reason: sigOk ? null : 'signature verification failed' };
}

// Verify a full chain — checks each entry's hash + signature AND that
// previous_event_hash links correctly to the prior entry.
export async function verifyLedgerChain(entries, signingKeys) {
  const results = [];
  let chainBroken = false;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const entryCheck = await verifyLedgerEntry(e, signingKeys);
    let chainOk = true;
    if (i > 0 && e.previous_event_hash !== entries[i - 1].event_hash) {
      chainOk = false;
      chainBroken = true;
    }
    results.push({
      event_id: e.id,
      event_type: e.event_type,
      content_valid: entryCheck.valid,
      signature_valid: entryCheck.valid,
      chain_valid: chainOk,
      reason: entryCheck.reason,
    });
  }
  return {
    entries_checked: entries.length,
    all_valid: results.every((r) => r.content_valid && r.signature_valid && r.chain_valid),
    chain_broken: chainBroken,
    results,
  };
}

// Integrity check — scans the ledger for any broken links or modified entries.
// Returns a summary suitable for the Trust Center or an admin dashboard.
export async function ledgerIntegrityCheck(svc, { tenant_id, limit = 500 } = {}) {
  const query = tenant_id ? { tenant_id } : {};
  const entries = await svc.entities.AuditLog.filter(query, '-created_date', limit).catch(() => []);
  if (!entries.length) return { status: 'empty', entries_checked: 0, broken: 0 };
  // Reverse to chronological order for chain verification.
  const chain = entries.reverse();
  const check = await verifyLedgerChain(chain);
  return {
    status: check.all_valid ? 'intact' : 'broken',
    entries_checked: check.entries_checked,
    broken: check.results.filter((r) => !r.content_valid || !r.signature_valid || !r.chain_valid).length,
    details: check.results.filter((r) => !r.content_valid || !r.signature_valid || !r.chain_valid),
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