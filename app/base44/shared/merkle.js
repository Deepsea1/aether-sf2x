// RFC 6962 (Certificate Transparency) Merkle tree over SHA-256 — the upgrade
// path for the registry's linear chain root (MASTER_PLAN v5 §9.3 + §10). A
// linear hash proves the whole chain or nothing; a Merkle tree admits
// O(log n) inclusion proofs, so anyone can check that ONE warrant is in the
// log without refetching the log.
//
// Conventions (RFC 6962 §2.1 — domain-separated hashing):
//   leaf hash = SHA-256(0x00 || leaf bytes)
//   node hash = SHA-256(0x01 || left || right)
//   Unbalanced trees split at the largest power of two LESS THAN n, never by
//   duplicating the last leaf (the Bitcoin construction — it admits
//   duplicate-leaf forgeries; RFC 6962 does not).
//   MTH of the empty tree = SHA-256 of the empty string.
//
// Leaves arrive as strings (the warrants' signed-hash artifacts, with the
// warrant id as the deterministic fallback when a warrant carries no
// signature) and are hashed as UTF-8 bytes. All hex output is lowercase.

function utf8Bytes(text) {
  return new TextEncoder().encode(String(text ?? ''));
}

function toHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
  const text = String(hex || '');
  if (text.length % 2 !== 0 || /[^0-9a-f]/i.test(text)) return null;
  return Uint8Array.from(text.match(/.{2}/g) || [], (pair) => parseInt(pair, 16));
}

function concatBytes(...parts) {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
}

async function sha256Bytes(bytes) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
}

// Largest power of two strictly less than n (n >= 2) — the RFC 6962 split point.
function splitPoint(n) {
  let k = 1;
  while (k * 2 < n) k *= 2;
  return k;
}

async function hashLeaves(leaves) {
  const hashes = [];
  for (const leaf of leaves) {
    hashes.push(await sha256Bytes(concatBytes(Uint8Array.of(0x00), utf8Bytes(leaf))));
  }
  return hashes;
}

// MTH(D[lo:hi]) over precomputed leaf hashes — RFC 6962 §2.1.
async function subtreeRoot(hashes, lo, hi) {
  const n = hi - lo;
  if (n === 1) return hashes[lo];
  const k = splitPoint(n);
  const left = await subtreeRoot(hashes, lo, lo + k);
  const right = await subtreeRoot(hashes, lo + k, hi);
  return sha256Bytes(concatBytes(Uint8Array.of(0x01), left, right));
}

export const MERKLE_ALGORITHM = 'RFC6962-SHA256';

// Merkle tree head over an ordered list of leaf strings → lowercase hex.
export async function merkleRoot(leaves) {
  const list = leaves || [];
  if (!list.length) return toHex(await sha256Bytes(new Uint8Array(0)));
  const hashes = await hashLeaves(list);
  return toHex(await subtreeRoot(hashes, 0, list.length));
}

// Audit path for leaves[index] — RFC 6962 §2.1.1 PATH(m, D[n]), siblings
// ordered leaf → root. Returns null (never a fabricated proof) when the index
// is not a valid position in the leaf set.
export async function inclusionProof(leaves, index) {
  const list = leaves || [];
  const m = Number(index);
  if (!Number.isInteger(m) || m < 0 || m >= list.length) return null;
  const hashes = await hashLeaves(list);
  const siblings = [];
  async function walk(lo, hi, target) {
    const n = hi - lo;
    if (n === 1) return;
    const k = splitPoint(n);
    if (target < k) {
      await walk(lo, lo + k, target);
      siblings.push(await subtreeRoot(hashes, lo + k, hi));
    } else {
      await walk(lo + k, hi, target - k);
      siblings.push(await subtreeRoot(hashes, lo, lo + k));
    }
  }
  await walk(0, list.length, m);
  return {
    leaf_hash: toHex(hashes[m]),
    index: m,
    tree_size: list.length,
    siblings: siblings.map(toHex),
    algorithm: MERKLE_ALGORITHM,
  };
}

// Verify an inclusion proof against a root — RFC 9162 §2.1.3.2 (the CT v2
// restatement of the RFC 6962 audit-path check). Recomputes leaf → root from
// the siblings alone; any malformed input fails closed to false.
export async function verifyInclusion(proof, root) {
  if (!proof || typeof proof !== 'object') return false;
  const treeSize = Number(proof.tree_size);
  let fn = Number(proof.index);
  if (!Number.isInteger(fn) || !Number.isInteger(treeSize) || fn < 0 || fn >= treeSize) return false;
  let node = hexToBytes(proof.leaf_hash);
  if (!node || node.length !== 32) return false;
  let sn = treeSize - 1;
  for (const sibling of proof.siblings || []) {
    if (sn === 0) return false;
    const p = hexToBytes(sibling);
    if (!p || p.length !== 32) return false;
    if ((fn & 1) === 1 || fn === sn) {
      node = await sha256Bytes(concatBytes(Uint8Array.of(0x01), p, node));
      if ((fn & 1) === 0) {
        while (fn !== 0 && (fn & 1) === 0) { fn >>= 1; sn >>= 1; }
      }
    } else {
      node = await sha256Bytes(concatBytes(Uint8Array.of(0x01), node, p));
    }
    fn >>= 1;
    sn >>= 1;
  }
  return sn === 0 && toHex(node) === String(root || '').toLowerCase();
}
