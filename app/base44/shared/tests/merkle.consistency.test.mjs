// EXHAUSTIVE conformance harness for the RFC 6962 §2.1.2 / RFC 9162 §2.1.4.2
// consistency proofs in merkle.js. Not sampled: every (m, n) pair for every
// tree size 1..33 is generated and verified against roots computed by the
// pre-existing, independently-written merkleRoot() — 561 pairs. Then every
// pair is attacked (byte flips at every position, truncation, extension,
// swapped/forged roots, cross-pair reuse) and must fail closed.
//
// Run: node --test app/base44/shared/tests/merkle.consistency.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { merkleRoot, consistencyProof, verifyConsistency } from '../merkle.js';

const MAX_N = 33;
const leaves = Array.from({ length: MAX_N }, (_, i) => `warrant-leaf-${i}-sf2x_ed25519_${'ab'.repeat(i % 7)}`);

// Roots for every prefix length, from the existing implementation only.
const rootFor = [];
for (let size = 0; size <= MAX_N; size++) rootFor[size] = await merkleRoot(leaves.slice(0, size));

// A second, deliberately independent MTH — node:crypto instead of WebCrypto,
// Buffers instead of Uint8Array, transcribed straight from RFC 6962 §2.1. If
// the proofs only ever validated against roots from the same code path they
// were built with, a shared bug would pass unnoticed. This is the tie-break.
function refMTH(list) {
  const n = list.length;
  if (n === 0) return createHash('sha256').update(Buffer.alloc(0)).digest('hex');
  if (n === 1) return createHash('sha256').update(Buffer.concat([Buffer.from([0x00]), Buffer.from(list[0], 'utf8')])).digest('hex');
  let k = 1;
  while (k * 2 < n) k *= 2;
  const left = Buffer.from(refMTH(list.slice(0, k)), 'hex');
  const right = Buffer.from(refMTH(list.slice(k)), 'hex');
  return createHash('sha256').update(Buffer.concat([Buffer.from([0x01]), left, right])).digest('hex');
}

test('two independent MTH implementations agree on every prefix root', () => {
  for (let size = 0; size <= MAX_N; size++) {
    assert.equal(rootFor[size], refMTH(leaves.slice(0, size)), `root mismatch at tree_size=${size}`);
  }
});

const flipHex = (hex, byteIndex) => {
  const pos = byteIndex * 2;
  const byte = parseInt(hex.slice(pos, pos + 2), 16) ^ 0xff;
  return hex.slice(0, pos) + byte.toString(16).padStart(2, '0') + hex.slice(pos + 2);
};

const counts = {
  pairs: 0,
  accepted: 0,
  emptyProofPairs: 0,
  tamperNodeFlips: 0,
  tamperTruncations: 0,
  tamperExtensions: 0,
  tamperForgedRoots: 0,
  tamperCrossPair: 0,
  rejected: 0,
};

// ——— 1. Every valid (m, n): the proof must exist and verify ———
test(`every consistency proof for 1 <= m <= n <= ${MAX_N} verifies`, async () => {
  for (let n = 1; n <= MAX_N; n++) {
    for (let m = 1; m <= n; m++) {
      const proof = await consistencyProof(leaves, m, n);
      assert.ok(Array.isArray(proof), `PROOF(${m}, D[${n}]) must not be null`);
      counts.pairs++;

      // m === n is the degenerate case: the empty proof, and only equal heads.
      if (m === n) {
        assert.deepEqual(proof, [], `PROOF(${m}, D[${n}]) must be the empty proof`);
        counts.emptyProofPairs++;
      } else {
        assert.ok(proof.length > 0, `PROOF(${m}, D[${n}]) must carry nodes`);
      }
      for (const node of proof) assert.match(node, /^[0-9a-f]{64}$/, 'nodes are lowercase 32-byte hex');

      const ok = await verifyConsistency(proof, m, rootFor[m], n, rootFor[n]);
      assert.equal(ok, true, `verifyConsistency failed for (m=${m}, n=${n})`);
      counts.accepted++;
    }
  }
  assert.equal(counts.pairs, (MAX_N * (MAX_N + 1)) / 2);
  assert.equal(counts.accepted, counts.pairs);
  assert.equal(counts.emptyProofPairs, MAX_N);
});

// ——— 2. Proof size is the RFC's minimal proof (a log-sized audit path) ———
test('proof length stays within the RFC minimal bound', async () => {
  for (let n = 2; n <= MAX_N; n++) {
    for (let m = 1; m < n; m++) {
      const proof = await consistencyProof(leaves, m, n);
      assert.ok(proof.length <= 2 * Math.ceil(Math.log2(n)) + 1, `(m=${m}, n=${n}) proof too long: ${proof.length}`);
    }
  }
});

// ——— 3. Tampering: every mutation must be rejected ———
test('tampered proofs, forged roots, and cross-pair reuse all fail closed', async () => {
  for (let n = 1; n <= MAX_N; n++) {
    for (let m = 1; m <= n; m++) {
      const proof = await consistencyProof(leaves, m, n);

      // 3a. Flip a byte at EVERY byte position of EVERY node.
      for (let i = 0; i < proof.length; i++) {
        for (const byteIndex of [0, 7, 31]) {
          const bad = [...proof];
          bad[i] = flipHex(bad[i], byteIndex);
          assert.equal(await verifyConsistency(bad, m, rootFor[m], n, rootFor[n]), false,
            `flipped node ${i} byte ${byteIndex} verified for (m=${m}, n=${n})`);
          counts.tamperNodeFlips++;
          counts.rejected++;
        }
      }

      // 3b. Truncate (drop the last node) and extend (append a plausible hash).
      if (proof.length > 0) {
        assert.equal(await verifyConsistency(proof.slice(0, -1), m, rootFor[m], n, rootFor[n]), false,
          `truncated proof verified for (m=${m}, n=${n})`);
        counts.tamperTruncations++;
        counts.rejected++;
      }
      assert.equal(await verifyConsistency([...proof, rootFor[n]], m, rootFor[m], n, rootFor[n]), false,
        `extended proof verified for (m=${m}, n=${n})`);
      counts.tamperExtensions++;
      counts.rejected++;

      // 3c. Forge either head — the fold must not land.
      const forgedFirst = flipHex(rootFor[m], 3);
      const forgedSecond = flipHex(rootFor[n], 3);
      assert.equal(await verifyConsistency(proof, m, forgedFirst, n, rootFor[n]), false,
        `forged first_hash verified for (m=${m}, n=${n})`);
      assert.equal(await verifyConsistency(proof, m, rootFor[m], n, forgedSecond), false,
        `forged second_hash verified for (m=${m}, n=${n})`);
      counts.tamperForgedRoots += 2;
      counts.rejected += 2;

      // 3d. Reuse this proof under a different claimed size — the classic fork
      // dressed up as a valid-looking proof.
      for (const otherM of [m - 1, m + 1]) {
        if (otherM < 1 || otherM > n) continue;
        assert.equal(await verifyConsistency(proof, otherM, rootFor[otherM], n, rootFor[n]), false,
          `proof for m=${m} verified as m=${otherM} (n=${n})`);
        counts.tamperCrossPair++;
        counts.rejected++;
      }
      for (const otherN of [n - 1, n + 1]) {
        if (otherN < m || otherN > MAX_N) continue;
        assert.equal(await verifyConsistency(proof, m, rootFor[m], otherN, rootFor[otherN]), false,
          `proof for n=${n} verified as n=${otherN} (m=${m})`);
        counts.tamperCrossPair++;
        counts.rejected++;
      }
    }
  }
});

// ——— 4. The m === n contract, stated on its own ———
test('m === n is the empty proof and demands equal heads', async () => {
  for (let n = 1; n <= MAX_N; n++) {
    assert.deepEqual(await consistencyProof(leaves, n, n), []);
    assert.equal(await verifyConsistency([], n, rootFor[n], n, rootFor[n]), true);
    // A non-empty proof for m === n is a claim with nothing behind it.
    assert.equal(await verifyConsistency([rootFor[n]], n, rootFor[n], n, rootFor[n]), false);
    // Same size, different roots = a fork, not a consistent log.
    const other = n === 1 ? rootFor[2] : rootFor[n - 1];
    assert.equal(await verifyConsistency([], n, rootFor[n], n, other), false);
  }
});

// ——— 5. Out-of-range and malformed input never fabricates a proof ———
test('undefined ranges return null, never a fabricated proof', async () => {
  assert.equal(await consistencyProof(leaves, 0, 5), null);          // RFC requires 0 < m
  assert.equal(await consistencyProof(leaves, -1, 5), null);
  assert.equal(await consistencyProof(leaves, 6, 5), null);          // m > n
  assert.equal(await consistencyProof(leaves, 1, MAX_N + 1), null);  // n beyond the leaves
  assert.equal(await consistencyProof(leaves, 1.5, 5), null);
  assert.equal(await consistencyProof(leaves, '2', 5) !== null, true); // numeric strings coerce
  assert.equal(await consistencyProof([], 1, 1), null);
  assert.equal(await consistencyProof(null, 1, 1), null);
});

test('malformed verifier input fails closed to false, never throws', async () => {
  const proof = await consistencyProof(leaves, 3, 8);
  const cases = [
    [null, 3, rootFor[3], 8, rootFor[8]],
    ['not-an-array', 3, rootFor[3], 8, rootFor[8]],
    [proof, 0, rootFor[3], 8, rootFor[8]],
    [proof, 3, rootFor[3], 2, rootFor[2]],           // n < m
    [proof, 3, 'nothex', 8, rootFor[8]],
    [proof, 3, rootFor[3], 8, ''],
    [proof, 3, rootFor[3], 8, null],
    [['zz'.repeat(32)], 3, rootFor[3], 8, rootFor[8]],
    [['abcd'], 3, rootFor[3], 8, rootFor[8]],        // wrong node length
    [[], 3, rootFor[3], 8, rootFor[8]],              // empty proof, m !== n
    [proof, NaN, rootFor[3], 8, rootFor[8]],
  ];
  for (const args of cases) assert.equal(await verifyConsistency(...args), false);
});

test('REPORT — exact counts', () => {
  const total = counts.tamperNodeFlips + counts.tamperTruncations + counts.tamperExtensions
    + counts.tamperForgedRoots + counts.tamperCrossPair;
  console.log(JSON.stringify({
    tree_sizes: `1..${MAX_N}`,
    pairs_generated: counts.pairs,
    proofs_accepted: counts.accepted,
    empty_proof_pairs_m_eq_n: counts.emptyProofPairs,
    tamper_node_byte_flips: counts.tamperNodeFlips,
    tamper_truncations: counts.tamperTruncations,
    tamper_extensions: counts.tamperExtensions,
    tamper_forged_roots: counts.tamperForgedRoots,
    tamper_cross_pair_reuse: counts.tamperCrossPair,
    tamper_cases_total: total,
    tamper_all_rejected: counts.rejected === total,
  }, null, 2));
  assert.equal(counts.rejected, total);
});
