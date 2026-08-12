// The proof engine — pure functions, no React, no imports. Everything the Proof
// Theater shows the visitor is computed HERE, in their own browser, from the
// published material alone.
//
// Three independent things are checkable from public data, and this module keeps
// them strictly apart because conflating them is how "proof" theatre becomes
// theatre:
//
//   1. INCLUSION — RFC 6962 / RFC 9162 Merkle audit path. Proves a leaf sits in
//      a tree with a given root. Mirrors app/base44/shared/merkle.js exactly
//      (0x00 leaf prefix, 0x01 node prefix, split at the largest power of two
//      STRICTLY LESS than n) and the fold that already ships in
//      src/pages/WarrantProof.jsx — but records every intermediate node so the
//      UI can show the ladder instead of a green tick.
//
//   2. CANONICALIZATION — RFC 8785 (JCS). Lets the browser rebuild the exact
//      bytes the server signed, from the published fields, and re-derive the
//      payload hash. Without this step a "signature verified" badge only proves
//      the server can hash its own blob.
//
//   3. SIGNATURE — Ed25519 over the UTF-8 bytes of the payload-hash HEX STRING
//      (the sf2xCore convention), artifact encoded 'sf2x_ed25519_' + base64url,
//      key supplied as SPKI PEM. Ed25519 in WebCrypto is recent (Chrome 137+,
//      Safari 17+, Firefox 129+, Node 18.4+); when it is missing we return
//      { supported: false } so the UI can say "your browser cannot do this"
//      rather than rendering a failure that is really a capability gap.
//
// Which seals those three combine into:
//
//   · the KEY DOCUMENT and the SIGNED TREE HEAD — both sign payloads made of
//     published fields, so both are fully checkable here.
//   · a warrant's v2 seal (signed_hash_v2) — NOT checkable by a stranger. Its
//     signed payload contains the conclusion, premises and sources themselves,
//     and the registry deliberately never publishes those (the privacy
//     boundary). Only a content owner can rebuild those bytes.
//   · a warrant's PUBLIC seal (public_seal) — checkable here, and the point of
//     publicWarrantPayload / verifyPublicSeal below. It signs a payload of
//     HASHES of that same content plus the identifiers, every field of which
//     the registry does publish, so the browser can rebuild the exact signed
//     bytes from a registry response alone. Content stays private; only digests
//     travel. It proves the registry's published hashes are the ones Aether
//     signed — it does NOT reveal, or let you check, the content behind them.
//
// Every function fails CLOSED and names the step that broke. Nothing here ever
// returns a bare boolean for a multi-step check — the caller gets the trail.

export const LEAF_PREFIX = 0x00;
export const NODE_PREFIX = 0x01;
export const ED25519_ARTIFACT_PREFIX = 'sf2x_ed25519_';
export const MERKLE_ALGORITHM = 'RFC6962-SHA256';

/** The canonical payload shapes the server signs. Kept as data so the UI can name them. */
export const SCHEMA = {
  keys: 'aether.keys.v1',
  treeHead: 'aether.treehead.v1',
  warrantV2: 'aether.warrant.v2',
  warrantPublic: 'aether.warrant.public.v1',
};

/**
 * The public seal's payload fields, in contract order. Every one of them is
 * material the registry publishes — that is the whole design: a stranger can
 * rebuild the signed bytes from a registry response and nothing else.
 */
export const PUBLIC_WARRANT_FIELDS = [
  'warrant_id',
  'answer_version_id',
  'answer_text_sha256',
  'conclusion_sha256',
  'premises_sha256',
  'sources_sha256',
  'created_date',
];

const subtle = (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle) || null;

// ——————————————————————————————————————————————————————————— bytes & hex

export function utf8Bytes(text) {
  return new TextEncoder().encode(String(text ?? ''));
}

export function toHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Hex → bytes, or null when the string is not clean lowercase/uppercase hex of even length. */
export function fromHex(hex) {
  const text = String(hex ?? '');
  if (!text.length || text.length % 2 !== 0 || /[^0-9a-f]/i.test(text)) return null;
  return Uint8Array.from(text.match(/.{2}/g), (pair) => parseInt(pair, 16));
}

export function concatBytes(...parts) {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
}

function requireSubtle() {
  if (!subtle) throw new Error('WebCrypto (crypto.subtle) is unavailable in this context');
  return subtle;
}

export async function sha256Bytes(bytes) {
  return new Uint8Array(await requireSubtle().digest('SHA-256', bytes));
}

/** SHA-256 of a string (UTF-8) or a byte array → lowercase hex. */
export async function sha256Hex(input) {
  const bytes = input instanceof Uint8Array ? input : utf8Bytes(input);
  return toHex(await sha256Bytes(bytes));
}

// ——————————————————————————————————————————————————————— RFC 6962 hashing

/** leaf hash = SHA-256(0x00 || leaf bytes). The 0x00 is what stops a node being replayed as a leaf. */
export async function leafHash(leafSource) {
  const bytes = leafSource instanceof Uint8Array ? leafSource : utf8Bytes(leafSource);
  return toHex(await sha256Bytes(concatBytes(Uint8Array.of(LEAF_PREFIX), bytes)));
}

/** node hash = SHA-256(0x01 || left || right). Both operands are 32-byte hex digests. */
export async function nodeHash(leftHex, rightHex) {
  const left = fromHex(leftHex);
  const right = fromHex(rightHex);
  if (!left || left.length !== 32) throw new Error('nodeHash: left is not a 32-byte hex digest');
  if (!right || right.length !== 32) throw new Error('nodeHash: right is not a 32-byte hex digest');
  return toHex(await sha256Bytes(concatBytes(Uint8Array.of(NODE_PREFIX), left, right)));
}

/**
 * Walk the audit path and return EVERY intermediate node — RFC 9162 §2.1.3.2.
 *
 * @param {{leaf_hash?:string,index:number,tree_size:number,siblings:string[],algorithm?:string}} proof
 * @param {string} leafSource  the original leaf string, re-hashed locally rather than trusted
 * @returns {Promise<{
 *   ok: boolean,
 *   failedStep: string|null,
 *   error: string|null,
 *   computedLeafHash: string|null,
 *   claimedLeafHash: string|null,
 *   leafMatches: boolean,
 *   computedRoot: string|null,
 *   index: number, treeSize: number,
 *   steps: Array<{level:number,left:string,right:string,out:string,usedSibling:string,siblingSide:'left'|'right'}>,
 * }>}
 */
export async function foldInclusionProof(proof, leafSource) {
  const out = {
    ok: false,
    failedStep: null,
    error: null,
    computedLeafHash: null,
    claimedLeafHash: proof && proof.leaf_hash ? String(proof.leaf_hash).toLowerCase() : null,
    leafMatches: false,
    computedRoot: null,
    index: Number(proof && proof.index),
    treeSize: Number(proof && proof.tree_size),
    steps: [],
  };

  if (!proof || typeof proof !== 'object') {
    out.failedStep = 'proof';
    out.error = 'No inclusion proof was supplied.';
    return out;
  }

  const treeSize = Number(proof.tree_size);
  let fn = Number(proof.index);
  if (!Number.isInteger(fn) || !Number.isInteger(treeSize) || fn < 0 || fn >= treeSize) {
    out.failedStep = 'index';
    out.error = `Leaf index ${proof.index} is not a valid position in a tree of ${proof.tree_size} leaves.`;
    return out;
  }

  // Re-hash the leaf ourselves. Taking proof.leaf_hash on faith would let the
  // server pick any leaf it liked and still "prove" inclusion.
  out.computedLeafHash = await leafHash(leafSource);
  out.leafMatches = !out.claimedLeafHash || out.claimedLeafHash === out.computedLeafHash;
  if (!out.leafMatches) {
    out.failedStep = 'leaf';
    out.error = 'The leaf hash we computed from the leaf material does not match the leaf hash in the proof.';
    return out;
  }

  let sn = treeSize - 1;
  let node = out.computedLeafHash;
  const siblings = Array.isArray(proof.siblings) ? proof.siblings : [];

  for (let i = 0; i < siblings.length; i++) {
    const sibling = String(siblings[i] || '').toLowerCase();
    if (sn === 0) {
      out.failedStep = `sibling:${i}`;
      out.error = `The proof carries ${siblings.length} siblings but the tree is only ${i} levels tall — the path overruns the root.`;
      return out;
    }
    const bytes = fromHex(sibling);
    if (!bytes || bytes.length !== 32) {
      out.failedStep = `sibling:${i}`;
      out.error = `Sibling ${i} is not a 32-byte SHA-256 digest.`;
      return out;
    }

    // fn is odd, or fn is the last node of this level → we are the RIGHT child.
    const siblingOnLeft = (fn & 1) === 1 || fn === sn;
    const left = siblingOnLeft ? sibling : node;
    const right = siblingOnLeft ? node : sibling;
    node = await nodeHash(left, right);
    out.steps.push({
      level: i,
      left,
      right,
      out: node,
      usedSibling: sibling,
      siblingSide: siblingOnLeft ? 'left' : 'right',
    });

    if (siblingOnLeft && (fn & 1) === 0) {
      // Right-edge case: climb past the run of left-child positions.
      while (fn !== 0 && (fn & 1) === 0) { fn >>= 1; sn >>= 1; }
    }
    fn >>= 1;
    sn >>= 1;
  }

  out.computedRoot = node;
  if (sn !== 0) {
    out.failedStep = 'height';
    out.error = 'The path ended before reaching the root — the proof is missing siblings.';
    return out;
  }
  out.ok = true;
  return out;
}

/**
 * foldInclusionProof + the comparison against the published root.
 * @returns the fold, plus { rootMatches, expectedRoot, verified }.
 */
export async function verifyInclusion(proof, expectedRoot, leafSource) {
  const fold = await foldInclusionProof(proof, leafSource);
  const expected = String(expectedRoot || '').toLowerCase();
  const rootMatches = !!fold.ok && !!expected && fold.computedRoot === expected;
  if (fold.ok && !rootMatches) {
    fold.failedStep = 'root';
    fold.error = expected
      ? 'The recomputed root does not equal the published Merkle root. Inclusion is NOT proven.'
      : 'No published Merkle root was supplied to compare against.';
  }
  return { ...fold, expectedRoot: expected || null, rootMatches, verified: !!fold.ok && rootMatches };
}

// ——————————————————————————————————————————— RFC 8785 canonicalization (JCS)

/**
 * RFC 8785 JSON Canonicalization Scheme. Byte-identical to
 * app/base44/shared/canonicalSign.js — recursive, object keys sorted by UTF-16
 * code unit (the JS default sort), primitives delegated to JSON.stringify.
 *
 * Fails closed on undefined / function / symbol / bigint / NaN / Infinity:
 * JSON.stringify would silently emit null or drop the key, and a canonicalizer
 * that quietly changes the payload is worse than no signature at all.
 */
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
    const keys = Object.keys(value).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + jcsCanonicalize(value[k])).join(',') + '}';
  }
  throw new Error('jcsCanonicalize: unsupported value type ' + t);
}

/** Canonicalize then hash — returns both, because the UI shows the string forming into the hash. */
export async function canonicalPayloadHash(payload) {
  const canonical = jcsCanonicalize(payload);
  return { canonical, hash: await sha256Hex(canonical), bytes: utf8Bytes(canonical).length };
}

/**
 * The exact payload op=keys self-signs: { schema, keys, legacy_schemes }.
 * Rebuilt from the published document so the browser can re-derive payload_hash.
 * Key objects are rebuilt field-by-field — an extra field the server added would
 * change the canonical bytes, and we would rather show that mismatch than hide it.
 */
export function keysDocumentPayload(doc) {
  if (!doc || !Array.isArray(doc.keys)) return null;
  return {
    schema: doc.schema || SCHEMA.keys,
    keys: doc.keys.map((k) => ({
      key_id: k.key_id,
      algorithm: k.algorithm,
      public_key_pem: k.public_key_pem,
      status: k.status,
    })),
    legacy_schemes: Array.isArray(doc.legacy_schemes) ? doc.legacy_schemes : [],
  };
}

/** The exact payload a signed tree head commits to: { schema, tree_size, merkle_root, prev_root }. */
export function treeHeadPayload(head) {
  if (!head) return null;
  return {
    schema: head.schema_version || SCHEMA.treeHead,
    tree_size: Number(head.tree_size),
    merkle_root: head.merkle_root,
    prev_root: head.prev_root ?? null,
  };
}

/**
 * The exact payload the PUBLIC warrant seal commits to — rebuilt from a
 * registry response, field by field, verbatim.
 *
 *   { schema, warrant_id, answer_version_id, answer_text_sha256,
 *     conclusion_sha256, premises_sha256, sources_sha256, created_date }
 *
 * Three deliberate rules:
 *
 *   · VERBATIM. Values are taken exactly as published — no lowercasing, no
 *     trimming, no date reformatting. Any "helpful" normalization here would
 *     change the bytes and produce a hash that never matches, which reads as a
 *     forged record when it is really a buggy verifier.
 *   · FAIL CLOSED on a missing field. Coercing an absent value to '' would
 *     silently rebuild a DIFFERENT payload; returning null lets the caller say
 *     which field the record is missing.
 *   · The schema tag is PINNED to the version this verifier implements, never
 *     adopted from the response. If the registry moves to a new schema, the
 *     rebuild must fail visibly rather than canonicalize whatever it is told.
 *
 * @returns the payload object, or null when it cannot be rebuilt.
 */
export function publicWarrantPayload(fields) {
  if (!fields || typeof fields !== 'object') return null;
  const payload = { schema: SCHEMA.warrantPublic };
  for (const key of PUBLIC_WARRANT_FIELDS) {
    const value = fields[key];
    if (typeof value !== 'string' || !value) return null;
    payload[key] = value;
  }
  return payload;
}

/** Which contract fields a registry response is missing — for naming the gap, not guessing past it. */
export function missingPublicWarrantFields(fields) {
  if (!fields || typeof fields !== 'object') return [...PUBLIC_WARRANT_FIELDS];
  return PUBLIC_WARRANT_FIELDS.filter((key) => typeof fields[key] !== 'string' || !fields[key]);
}

// ————————————————————————————————————————————————————————— Ed25519 (SPKI PEM)

export function base64UrlToBytes(b64url) {
  const normalized = String(b64url || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  if (typeof atob !== 'function') throw new Error('base64 decoding unavailable');
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/** Strip the PEM armour and return the DER bytes. Throws on anything that is not a PEM block. */
export function pemToDer(pem) {
  const body = String(pem || '').replace(/-----(BEGIN|END)[^-]+-----/g, '').replace(/\s+/g, '');
  if (!body) throw new Error('empty PEM');
  return base64UrlToBytes(body);
}

/** Split 'sf2x_ed25519_<base64url>' into its scheme + raw 64-byte signature. */
export function parseSignatureArtifact(artifact) {
  const text = String(artifact || '');
  if (!text.startsWith(ED25519_ARTIFACT_PREFIX)) {
    if (text.startsWith('sf2x_')) return { scheme: 'legacy', bytes: null, note: 'Legacy seal — HMAC or content fingerprint. Verifiable server-side only.' };
    return { scheme: 'unknown', bytes: null, note: 'Not a recognised Aether signature artifact.' };
  }
  let bytes = null;
  try { bytes = base64UrlToBytes(text.slice(ED25519_ARTIFACT_PREFIX.length)); } catch { /* malformed base64url */ }
  return { scheme: 'Ed25519', bytes, note: null };
}

let _ed25519Support = null;
/** Feature-detect Ed25519 in WebCrypto once. Never throws. */
export async function ed25519Supported() {
  if (_ed25519Support !== null) return _ed25519Support;
  if (!subtle) { _ed25519Support = false; return false; }
  try {
    // A 32-byte all-zero SPKI is invalid, so importKey must reject — but a
    // browser without Ed25519 rejects with NotSupportedError *before* parsing.
    await subtle.importKey('raw', new Uint8Array(32), { name: 'Ed25519' }, false, ['verify']);
    _ed25519Support = true;
  } catch (e) {
    _ed25519Support = !/not supported|unrecognized|unsupported/i.test(String(e && (e.message || e.name)));
  }
  return _ed25519Support;
}

/**
 * Verify an Aether Ed25519 seal over a payload-hash hex string.
 *
 * The signed message is the UTF-8 bytes of the HEX STRING itself (not the raw
 * digest bytes) — the sf2xCore convention. Getting this wrong is the single
 * most likely way an independent verifier reimplements this and gets `false`.
 *
 * @returns {Promise<{supported:boolean, valid:boolean, reason:string|null, keyImported:boolean}>}
 */
export async function verifyEd25519(payloadHashHex, artifact, pemSpki) {
  const parsed = parseSignatureArtifact(artifact);
  if (parsed.scheme !== 'Ed25519') {
    return { supported: true, valid: false, keyImported: false, reason: parsed.note };
  }
  if (!parsed.bytes || parsed.bytes.length !== 64) {
    return { supported: true, valid: false, keyImported: false, reason: 'Signature is not 64 bytes — the artifact is malformed.' };
  }
  if (!subtle) {
    return { supported: false, valid: false, keyImported: false, reason: 'WebCrypto is unavailable here (an insecure origin, or a very old browser).' };
  }
  if (!(await ed25519Supported())) {
    return { supported: false, valid: false, keyImported: false, reason: 'This browser’s WebCrypto has no Ed25519. Needs Chrome 137+, Safari 17+, Firefox 129+, or Node 18.4+.' };
  }

  let key;
  try {
    key = await subtle.importKey('spki', pemToDer(pemSpki), { name: 'Ed25519' }, false, ['verify']);
  } catch (e) {
    if (/not supported|unrecognized|unsupported/i.test(String(e && (e.message || e.name)))) {
      return { supported: false, valid: false, keyImported: false, reason: 'This browser cannot import an Ed25519 public key.' };
    }
    return { supported: true, valid: false, keyImported: false, reason: 'The published public key could not be parsed as SPKI PEM.' };
  }

  try {
    const valid = await subtle.verify({ name: 'Ed25519' }, key, parsed.bytes, utf8Bytes(payloadHashHex));
    return {
      supported: true,
      valid,
      keyImported: true,
      reason: valid ? null : 'The signature does not match this payload hash under this key.',
    };
  } catch (e) {
    return { supported: true, valid: false, keyImported: true, reason: `Verification threw: ${e && e.message}` };
  }
}

/**
 * The whole seal check in one call: rebuild the canonical payload, re-derive the
 * hash, compare it to the published one, then verify the signature over it.
 * Each stage is reported separately — "the hash matched but the signature did
 * not" is a completely different accusation from "the payload was rebuilt wrong".
 */
export async function verifySealedDocument({ payload, publishedHash, signature, publicKeyPem }) {
  const result = {
    canonical: null, bytes: 0, computedHash: null,
    publishedHash: publishedHash ? String(publishedHash).toLowerCase() : null,
    hashMatches: false, signature: null, ok: false, failedStep: null, error: null,
  };
  if (!payload) {
    result.failedStep = 'payload';
    result.error = 'No canonical payload could be rebuilt from the published document.';
    return result;
  }
  try {
    const { canonical, hash, bytes } = await canonicalPayloadHash(payload);
    result.canonical = canonical;
    result.computedHash = hash;
    result.bytes = bytes;
  } catch (e) {
    result.failedStep = 'canonicalize';
    result.error = `Canonicalization failed: ${e && e.message}`;
    return result;
  }
  result.hashMatches = !!result.publishedHash && result.publishedHash === result.computedHash;
  if (!result.hashMatches) {
    result.failedStep = 'hash';
    result.error = result.publishedHash
      ? 'The hash we computed from the published fields is not the hash the server published. The document does not describe what was signed.'
      : 'The document published no payload hash to compare against.';
    return result;
  }
  if (!publicKeyPem) {
    result.failedStep = 'key';
    result.error = 'No public key was published, so the signature cannot be checked here.';
    return result;
  }
  result.signature = await verifyEd25519(result.computedHash, signature, publicKeyPem);
  if (!result.signature.supported) { result.failedStep = 'unsupported'; result.error = result.signature.reason; return result; }
  if (!result.signature.valid) { result.failedStep = 'signature'; result.error = result.signature.reason; return result; }
  result.ok = true;
  return result;
}

/**
 * Verify a warrant's PUBLIC seal entirely in this browser.
 *
 * Rebuild the payload from the published hashes → canonicalize it (RFC 8785) →
 * SHA-256 it here → check the Ed25519 signature over that hex string with the
 * key from ?op=keys. No server round-trip, and the registry's own verdict is
 * never substituted for the result.
 *
 * The published `public_payload_hash` is a CROSS-CHECK, not the thing under
 * test: the signature is verified against the hash this browser computed. A
 * published hash that disagrees means the record does not describe what was
 * signed, and fails closed. A record that publishes no hash at all is not a
 * failure — the local hash is the stronger input anyway — so the check
 * continues and reports `hashMatches: null`.
 *
 * @param {object} registryWarrant  a verified_warrant block from warrantRegistry
 * @param {string} pemPublicKey     SPKI PEM from the key document
 * @returns {Promise<{
 *   supported: boolean, valid: boolean, reason: string|null,
 *   payload: object|null, payload_hash: string|null,
 *   canonical: string|null, publishedHash: string|null, hashMatches: boolean|null,
 *   sealed: boolean, keyId: string|null, signature: object|null, failedStep: string|null,
 * }>}
 */
export async function verifyPublicSeal(registryWarrant, pemPublicKey) {
  const result = {
    supported: true,
    valid: false,
    reason: null,
    payload: null,
    payload_hash: null,
    canonical: null,
    publishedHash: null,
    hashMatches: null,
    sealed: false,
    keyId: null,
    signature: null,
    failedStep: null,
  };

  if (!registryWarrant || typeof registryWarrant !== 'object') {
    result.failedStep = 'input';
    result.reason = 'No warrant record was supplied, so there is nothing to check.';
    return result;
  }

  result.keyId = registryWarrant.public_seal_key_id || null;
  result.publishedHash = registryWarrant.public_payload_hash
    ? String(registryWarrant.public_payload_hash).toLowerCase()
    : null;

  const artifact = typeof registryWarrant.public_seal === 'string' ? registryWarrant.public_seal : '';
  result.sealed = registryWarrant.publicly_sealed === true || !!artifact;

  // ABSENT IS ABSENT. A warrant issued before the public seal existed has not
  // failed anything — it simply carries no seal to check, and saying so is the
  // whole difference between an honest page and a red tick.
  if (!result.sealed) {
    result.failedStep = 'unsealed';
    result.reason = 'This warrant carries no public seal — it pre-dates the seal. Nothing failed here; there is nothing to check.';
    return result;
  }
  if (!artifact) {
    result.failedStep = 'seal';
    result.reason = 'The registry marks this warrant publicly sealed but published no signature artifact. That contradiction is reported, not resolved in the registry’s favour.';
    return result;
  }

  // Optional: if the record names its own schema and it is not the one this
  // verifier implements, stop. Adopting it would rebuild the payload to the
  // server's dictation; guessing past it would hash the wrong shape.
  const publishedSchema = registryWarrant.public_schema;
  if (typeof publishedSchema === 'string' && publishedSchema && publishedSchema !== SCHEMA.warrantPublic) {
    result.failedStep = 'schema';
    result.reason = `The record is sealed under schema ${publishedSchema}; this page implements ${SCHEMA.warrantPublic}. Rebuilding it here would be a guess.`;
    return result;
  }

  const payload = publicWarrantPayload(registryWarrant);
  if (!payload) {
    result.failedStep = 'payload';
    result.reason = `The published record is missing ${missingPublicWarrantFields(registryWarrant).join(', ')} — the signed payload cannot be rebuilt from it.`;
    return result;
  }
  result.payload = payload;

  try {
    const { canonical, hash } = await canonicalPayloadHash(payload);
    result.canonical = canonical;
    result.payload_hash = hash;
  } catch (e) {
    result.failedStep = 'canonicalize';
    result.reason = `Canonicalization failed: ${e && e.message}`;
    return result;
  }

  if (result.publishedHash) {
    result.hashMatches = result.publishedHash === result.payload_hash;
    if (!result.hashMatches) {
      result.failedStep = 'hash';
      result.reason = 'The hash rebuilt from the published fields is not the hash the registry published. The record does not describe what was signed.';
      return result;
    }
  }

  if (!pemPublicKey) {
    result.failedStep = 'key';
    result.reason = 'No public key was published, so the seal cannot be checked here.';
    return result;
  }

  result.signature = await verifyEd25519(result.payload_hash, artifact, pemPublicKey);
  if (!result.signature.supported) {
    result.supported = false;
    result.failedStep = 'unsupported';
    result.reason = result.signature.reason;
    return result;
  }
  if (!result.signature.valid) {
    result.failedStep = 'signature';
    result.reason = result.signature.reason;
    return result;
  }

  result.valid = true;
  return result;
}

export default {
  SCHEMA, MERKLE_ALGORITHM, LEAF_PREFIX, NODE_PREFIX, ED25519_ARTIFACT_PREFIX,
  PUBLIC_WARRANT_FIELDS,
  utf8Bytes, toHex, fromHex, concatBytes, sha256Bytes, sha256Hex,
  leafHash, nodeHash, foldInclusionProof, verifyInclusion,
  jcsCanonicalize, canonicalPayloadHash, keysDocumentPayload, treeHeadPayload,
  publicWarrantPayload, missingPublicWarrantFields,
  base64UrlToBytes, pemToDer, parseSignatureArtifact, ed25519Supported, verifyEd25519,
  verifySealedDocument, verifyPublicSeal,
};
