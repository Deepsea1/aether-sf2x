// Canonical warrant signing v2 — RFC 8785 (JCS) canonicalization + Ed25519.
//
// The legacy signed_hash input is a '|'-join with ';;' sub-joins — delimiter-
// ambiguous and non-canonical across four variant forms, which is why
// verification has to brute-force variants. v2 instead signs the SHA-256 of
// the RFC 8785 canonical JSON of a fixed payload shape, so any verifier can
// rebuild the exact signed bytes from the persisted entity fields. Dual-sign:
// every warrant writer keeps producing the legacy signed_hash byte-for-byte
// AND additionally stores the v2 fields; new verification prefers v2.
//
// Usage (writers):
//   const v2 = await signWarrantV2(buildWarrantV2Payload({ answer_version_id, answer_text_sha256, conclusion, premises, sources }));
//   if (v2) store { schema_version, payload_hash_v2, signed_hash_v2, key_id_v2: v2.key_id, answer_text_sha256 } on the Warrant.
//
// Verification (public key only):
//   const ok = await verifyWarrantV2(payload, warrant.signed_hash_v2);

import { generateSignature, verifySignature } from './sf2xCore.js';

export const WARRANT_SCHEMA_V2 = 'aether.warrant.v2';

// RFC 8785 (JSON Canonicalization Scheme): recursive serialization with object
// keys sorted by UTF-16 code units; strings, numbers, and literals delegate to
// JSON.stringify, whose string escaping and ECMAScript number serialization
// match the RFC. Fails closed: undefined, functions, symbols, BigInt, NaN, and
// Infinity throw instead of being silently coerced — JSON.stringify would emit
// null or drop the property, and a canonicalization that silently changes the
// payload is worse than no signature.
export function jcsCanonicalize(value) {
  if (value === null) return 'null';
  const t = typeof value;
  if (t === 'boolean') return value ? 'true' : 'false';
  if (t === 'number') {
    if (!Number.isFinite(value)) throw new Error('jcsCanonicalize: non-finite number');
    return JSON.stringify(value);
  }
  if (t === 'string') return JSON.stringify(value);
  if (t === 'object') {
    if (Array.isArray(value)) return '[' + value.map((v) => jcsCanonicalize(v)).join(',') + ']';
    // Default sort compares UTF-16 code units — exactly the RFC 8785 key order.
    const keys = Object.keys(value).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + jcsCanonicalize(value[k])).join(',') + '}';
  }
  throw new Error('jcsCanonicalize: unsupported value type ' + t); // undefined / function / symbol / bigint
}

export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text ?? '')));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// The v2 signed payload — EXACTLY these keys plus the schema tag. No issued_at:
// the signature binds content; time attestation comes from the ledger /
// transparency chain. answer_text_sha256 MUST hash the answer text AS PERSISTED
// on the AnswerVersion row (post-truncation slice), and conclusion / premises /
// sources MUST be the values persisted on the Warrant row — otherwise
// recomputation from entities fails.
export function buildWarrantV2Payload({ answer_version_id, answer_text_sha256, conclusion, premises, sources }) {
  return {
    schema: WARRANT_SCHEMA_V2,
    answer_version_id,
    answer_text_sha256,
    conclusion,
    premises,
    sources,
  };
}

// Lazy key accessor — avoids importing secrets at module load (mirrors ledger.js).
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

// 'ed25519:' + first 16 hex chars of the SHA-256 of the ED25519_PUBLIC_KEY pem
// string — a stable identifier for WHICH key signed, without exposing the key.
// Returns null when the public key secret is absent (fail closed).
export async function publicKeyId() {
  const keys = await getKeys();
  if (!keys.ed25519PublicKey) return null;
  return 'ed25519:' + (await sha256Hex(keys.ed25519PublicKey)).slice(0, 16);
}

// Sign the canonical payload. payload_hash_v2 = SHA-256 of the RFC 8785
// canonical JSON; signed_hash_v2 = Ed25519 over the UTF-8 bytes of the
// payload_hash_v2 HEX STRING, encoded 'sf2x_ed25519_' + base64url (the
// sf2xCore generateSignature conventions). Returns null when the Ed25519 keys
// are absent — v2 is additive and must never fail warrant creation, so callers
// store no v2 fields on null. Canonicalization errors still throw (callers
// wrap) so a malformed payload is visible rather than silently unsigned.
export async function signWarrantV2(payload) {
  const keys = await getKeys();
  if (!keys.ed25519PrivateKey || !keys.ed25519PublicKey) return null;
  const payloadHash = await sha256Hex(jcsCanonicalize(payload));
  const signedHash = await generateSignature(payloadHash, { ed25519PrivateKey: keys.ed25519PrivateKey });
  // Fail closed — never store a non-Ed25519 artifact (HMAC/fingerprint fallback) as v2.
  if (!String(signedHash).startsWith('sf2x_ed25519_')) return null;
  return {
    schema_version: WARRANT_SCHEMA_V2,
    payload_hash_v2: payloadHash,
    signed_hash_v2: signedHash,
    key_id: await publicKeyId(),
  };
}

// Verify a v2 signature with the PUBLIC key only — the private key is never
// loaded on the verify path. Recomputes the canonical payload hash and checks
// the Ed25519 signature over its hex string. Fails closed: a missing key, a
// non-Ed25519 artifact, or a canonicalization error all return false.
export async function verifyWarrantV2(payload, signedHashV2) {
  try {
    if (!String(signedHashV2 || '').startsWith('sf2x_ed25519_')) return false;
    const keys = await getKeys();
    if (!keys.ed25519PublicKey) return false;
    const payloadHash = await sha256Hex(jcsCanonicalize(payload));
    return await verifySignature(payloadHash, signedHashV2, { ed25519PublicKey: keys.ed25519PublicKey });
  } catch {
    return false;
  }
}

// ——— The PUBLIC seal ————————————————————————————————————————————————————————
//
// The v2 seal signs CONTENT — conclusion, premises, sources — and the warrant
// registry deliberately never publishes any of it (the P1 privacy boundary:
// the chain makes every warrant enumerable, so content there would make every
// customer inquiry readable without auth). The consequence is that a stranger
// holding a registry response CANNOT reconstruct the v2 signed bytes and so
// cannot check a warrant's own seal. That gap is real and has been stated
// honestly rather than papered over.
//
// The public seal closes it without moving the boundary: an ADDITIONAL Ed25519
// signature over a payload made entirely of PUBLISHED material — ids, hashes,
// and the row's created_date. Every field of it appears in the registry
// response, so a verifier rebuilds the payload from that response alone,
// canonicalizes it (RFC 8785), hashes it, and checks the signature with the key
// from ?op=keys — fully offline, nothing from us but the key document. Content
// stays private; only hashes travel.
//
// Usage (writers), AFTER the Warrant row exists (warrant_id + created_date are
// part of what is signed):
//   const pub = await buildPublicWarrantPayload({ warrant_id, answer_version_id,
//     answer_text_sha256, conclusion, premises, sources, created_date });
//   const sealed = await signPublicWarrant(pub);
//   if (sealed) store { conclusion_sha256, premises_sha256, sources_sha256 } from
//   `pub` plus { public_payload_hash, public_seal, public_seal_key_id } from `sealed`.
export const WARRANT_PUBLIC_SCHEMA_V1 = 'aether.warrant.public.v1';

// Build the public payload — EXACTLY these keys plus the schema tag. The three
// content fields are hashed here, never carried: conclusion as the string
// persisted on the row, premises/sources as the RFC 8785 canonicalization of
// the arrays persisted on the row (canonical, so the hash is independent of any
// serializer's whims). The four identifier fields are required to be non-empty
// strings and throw otherwise — a payload with a missing id or timestamp cannot
// be rebuilt by a verifier, so it must never be signed. Callers wrap, so a
// throw means "this warrant carries no public seal", which is an honest state.
export async function buildPublicWarrantPayload({ warrant_id, answer_version_id, answer_text_sha256, conclusion, premises, sources, created_date }) {
  const required = { warrant_id, answer_version_id, answer_text_sha256, created_date };
  for (const [name, value] of Object.entries(required)) {
    if (typeof value !== 'string' || !value) {
      throw new Error(`buildPublicWarrantPayload: ${name} must be a non-empty string`);
    }
  }
  return {
    schema: WARRANT_PUBLIC_SCHEMA_V1,
    warrant_id,
    answer_version_id,
    answer_text_sha256,
    conclusion_sha256: await sha256Hex(String(conclusion ?? '')),
    premises_sha256: await sha256Hex(jcsCanonicalize(Array.isArray(premises) ? premises : [])),
    sources_sha256: await sha256Hex(jcsCanonicalize(Array.isArray(sources) ? sources : [])),
    created_date,
  };
}

// Sign the public payload with the same mechanics as signWarrantV2:
// public_payload_hash = SHA-256 of the RFC 8785 canonical JSON; public_seal =
// Ed25519 over the UTF-8 bytes of that hex STRING, encoded 'sf2x_ed25519_' +
// base64url. Returns null when the Ed25519 keys are absent, and null rather
// than an HMAC/fingerprint fallback if generateSignature degrades — an
// unsigned artifact stored as a "public seal" would be a false claim, and the
// whole point of this seal is that it is checkable by someone who does not
// trust us.
export async function signPublicWarrant(payload) {
  const keys = await getKeys();
  if (!keys.ed25519PrivateKey || !keys.ed25519PublicKey) return null;
  const publicPayloadHash = await sha256Hex(jcsCanonicalize(payload));
  const seal = await generateSignature(publicPayloadHash, { ed25519PrivateKey: keys.ed25519PrivateKey });
  if (!String(seal).startsWith('sf2x_ed25519_')) return null;
  return {
    schema: WARRANT_PUBLIC_SCHEMA_V1,
    public_payload_hash: publicPayloadHash,
    public_seal: seal,
    public_seal_key_id: await publicKeyId(),
  };
}

// Verify a public seal with the PUBLIC key only — the mirror of
// verifyWarrantV2, and the check any third party performs with the published
// key document. Fails closed on a missing key, a non-Ed25519 artifact, or a
// canonicalization error.
export async function verifyPublicWarrant(payload, seal) {
  try {
    if (!String(seal || '').startsWith('sf2x_ed25519_')) return false;
    const keys = await getKeys();
    if (!keys.ed25519PublicKey) return false;
    const publicPayloadHash = await sha256Hex(jcsCanonicalize(payload));
    return await verifySignature(publicPayloadHash, seal, { ed25519PublicKey: keys.ed25519PublicKey });
  } catch {
    return false;
  }
}
