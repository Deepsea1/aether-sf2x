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

// ——— Consistency proofs (RFC 6962 §2.1.2 / RFC 9162 §2.1.4.2) ———
//
// An inclusion proof says "this warrant is under root R". It says NOTHING
// about whether R itself was reached honestly: a log that rewrote history
// between two published heads can still hand out perfectly valid inclusion
// proofs against the new, forked root. A consistency proof closes that hole —
// it proves the tree of size n is an APPEND of the tree of size m, i.e. that
// every one of the first m leaves is byte-identical and in the same order in
// both trees. Chain those across every published head and the whole log is
// provably append-only, not merely asserted to be.
//
// SUBPROOF(m, D[n], b) — the recursion, verbatim from RFC 6962 §2.1.2:
//   SUBPROOF(m, D[m], true)  = {}           (the caller already knows MTH(D[m]))
//   SUBPROOF(m, D[m], false) = {MTH(D[m])}
//   for m < n, k = largest power of two < n:
//     m <= k:  SUBPROOF(m, D[0:k], b)      : MTH(D[k:n])
//     m >  k:  SUBPROOF(m-k, D[k:n], false) : MTH(D[0:k])
// The boolean b tracks whether D[0:m] is a COMPLETE subtree of D[n] — when it
// is (and it is the originally requested m), MTH(D[m]) is omitted from the
// wire and the verifier reconstructs it from first_hash (step 1 below).

// SUBPROOF over precomputed leaf hashes, appending node hashes into `out` in
// RFC order (recursion first, then the sibling commitment — the RFC's `:`).
async function subproof(hashes, lo, hi, m, b, out) {
  const n = hi - lo;
  if (m === n) {
    // SUBPROOF(m, D[m], b): empty when the verifier already holds MTH(D[m]).
    if (!b) out.push(await subtreeRoot(hashes, lo, hi));
    return;
  }
  const k = splitPoint(n); // m < n here, so n >= 2 and splitPoint is defined
  if (m <= k) {
    // The right subtree exists only in the newer tree — prove the left half is
    // consistent, then commit to everything that was appended.
    await subproof(hashes, lo, lo + k, m, b, out);
    out.push(await subtreeRoot(hashes, lo + k, hi));
  } else {
    // The left subtree is identical in both trees — prove the right half is
    // consistent, then commit to the unchanged left half.
    await subproof(hashes, lo + k, hi, m - k, false, out);
    out.push(await subtreeRoot(hashes, lo, lo + k));
  }
}

// PROOF(m, D[n]) — the minimal consistency proof that the tree of size n
// extends the tree of size m, as lowercase hex node hashes.
//
// Returns [] when m === n (the trees are the same tree: nothing to transmit,
// and the verifier's whole job is checking the two heads agree). Returns null
// — never a fabricated proof — for any range the spec does not define:
// non-integers, m < 1, m > n, or n beyond the leaves actually supplied.
export async function consistencyProof(leaves, m, n) {
  const list = leaves || [];
  const first = Number(m);
  const second = n === undefined || n === null ? list.length : Number(n);
  if (!Number.isInteger(first) || !Number.isInteger(second)) return null;
  if (first < 1 || second < first || second > list.length) return null;
  if (first === second) return [];
  const hashes = await hashLeaves(list.slice(0, second));
  const out = [];
  await subproof(hashes, 0, second, first, true, out);
  return out.map(toHex);
}

// Verify a consistency proof — RFC 9162 §2.1.4.2, the fr/sr double fold. The
// same node list is folded twice: `fr` reconstructs the OLD root from the
// subset of nodes that were already present at size m, `sr` reconstructs the
// NEW root from all of them. Both must land, and the walk must consume the
// whole tree (sn === 0), or the proof fails.
//
// Fails closed to false on every malformed input: this is the function that
// decides whether the log forked, so an exception or a soft "probably fine"
// would be worse than useless.
export async function verifyConsistency(proof, m, firstRoot, n, secondRoot) {
  if (!Array.isArray(proof)) return false;
  const first = Number(m);
  const second = Number(n);
  if (!Number.isInteger(first) || !Number.isInteger(second)) return false;
  if (first < 1 || second < first) return false;

  const firstHex = String(firstRoot || '').toLowerCase();
  const secondHex = String(secondRoot || '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(firstHex) || !/^[0-9a-f]{64}$/.test(secondHex)) return false;

  // m === n — the degenerate case RFC 6962 leaves undefined (it specifies
  // 0 < m < n). The trees are the same tree: the proof must be EMPTY and the
  // two heads must agree. Anything else is a claim we refuse to bless.
  if (first === second) return proof.length === 0 && firstHex === secondHex;
  if (!proof.length) return false;

  // Step 1 — when m is an exact power of two, D[0:m] is a complete subtree and
  // the generator omitted MTH(D[0:m]) from the wire. Put it back from the head
  // the caller is checking against; the fold then either reproduces that head
  // or it does not.
  const path = [];
  if ((first & (first - 1)) === 0) path.push(hexToBytes(firstHex));
  for (const node of proof) {
    const bytes = hexToBytes(node);
    if (!bytes || bytes.length !== 32) return false;
    path.push(bytes);
  }

  // Steps 2–3 — fn/sn are the 0-based indices of the last leaf in each tree;
  // shift off the trailing 1-bits of fn so the walk starts at the first node
  // where the two trees can differ.
  let fn = first - 1;
  let sn = second - 1;
  while ((fn & 1) === 1) { fn >>= 1; sn >>= 1; }

  // Step 4 — both folds start at the same node.
  let fr = path[0];
  let sr = path[0];

  // Step 5 — fold the remaining nodes.
  for (let i = 1; i < path.length; i++) {
    const c = path[i];
    if (sn === 0) return false; // more nodes than the tree can absorb
    if ((fn & 1) === 1 || fn === sn) {
      // c is a LEFT sibling in both trees — it contributes to both roots.
      fr = await sha256Bytes(concatBytes(Uint8Array.of(0x01), c, fr));
      sr = await sha256Bytes(concatBytes(Uint8Array.of(0x01), c, sr));
      if ((fn & 1) === 0) {
        while (fn !== 0 && (fn & 1) === 0) { fn >>= 1; sn >>= 1; }
      }
    } else {
      // c hangs off the appended part of the tree — new root only.
      sr = await sha256Bytes(concatBytes(Uint8Array.of(0x01), sr, c));
    }
    fn >>= 1;
    sn >>= 1;
  }

  // Step 6 — the old head, the new head, and a fully consumed tree.
  return sn === 0 && toHex(fr) === firstHex && toHex(sr) === secondHex;
}
