// Node harness for src/lib/proof/verify.js — the crypto the Proof Theater runs
// in the visitor's browser. Run: node scripts/verify-proof-harness.mjs
//
// Covers, in order:
//   1. RFC 6962 known-answer vectors (empty tree, single leaf, domain separation)
//   2. JCS / RFC 8785 canonicalization vectors (key order, escaping, nesting)
//   3. Cross-check against the SHIPPING app/base44/shared/merkle.js: for every
//      tree size 1..33 and every leaf index, our fold must reproduce that
//      module's root from that module's proof.
//   4. Tamper detection: flipped sibling, wrong index, wrong leaf, short path,
//      swapped left/right, second-preimage (a node replayed as a leaf).
//   5. Ed25519 round-trip with a locally generated key, plus negative cases.
//   6. The PUBLIC warrant seal: payload rebuild determinism, hash agreement,
//      signature round-trip with a locally generated key, and per-field tamper
//      detection — plus the honest non-verdicts (unsealed, no key, no hash).

import { webcrypto } from 'node:crypto';
import {
  sha256Hex, leafHash, nodeHash, foldInclusionProof, verifyInclusion,
  jcsCanonicalize, canonicalPayloadHash, verifyEd25519, ed25519Supported,
  toHex, fromHex, treeHeadPayload, keysDocumentPayload, verifySealedDocument,
  publicWarrantPayload, missingPublicWarrantFields, verifyPublicSeal,
  PUBLIC_WARRANT_FIELDS,
} from '../src/lib/proof/verify.js';
import { merkleRoot, inclusionProof, verifyInclusion as sharedVerify } from '../base44/shared/merkle.js';
// The SHIPPING server-side canonicalizer + signature encoder, for the
// cross-implementation check in section 6.
import { jcsCanonicalize as serverJcs, sha256Hex as serverSha256Hex } from '../base44/shared/canonicalSign.js';
import { generateSignature as serverSign } from '../base44/shared/sf2xCore.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; return; }
  failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
}
function eq(name, actual, expected) {
  check(name, actual === expected, `got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`);
}

// ————————————————————————————————— 1. RFC 6962 known answers
{
  // MTH({}) = SHA-256("") — the CT empty-tree head.
  eq('sha256("") vector', await sha256Hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  eq('empty merkle root == sha256("")', await merkleRoot([]), await sha256Hex(''));

  // RFC 6962 §2.1: MTH({d0}) = SHA-256(0x00 || d0). Vector for the empty leaf.
  eq('leafHash("") vector', await leafHash(''), '6e340b9cffb37a989ca544e6bb780a2c78901d3fb33738768511a30617afa01d');
  eq('single-leaf root == leafHash', await merkleRoot(['']), await leafHash(''));

  // Domain separation is the whole point: a leaf and a node over the same bytes must differ.
  const l = await leafHash('a');
  const n = await nodeHash(l, l);
  check('leaf and node prefixes differ', l !== n);
  // And the node hash is a real SHA-256 over 0x01||left||right, not a concat of hex.
  const manual = await sha256Hex(Uint8Array.from([1, ...fromHex(l), ...fromHex(l)]));
  eq('nodeHash == sha256(0x01||l||r)', n, manual);

  // Two-leaf tree: root = node(leaf(a), leaf(b)).
  eq('2-leaf root', await merkleRoot(['a', 'b']), await nodeHash(await leafHash('a'), await leafHash('b')));
}

// ————————————————————————————————— 2. RFC 8785 canonicalization
{
  eq('jcs key sort', jcsCanonicalize({ b: 1, a: 2 }), '{"a":2,"b":1}');
  eq('jcs nested sort', jcsCanonicalize({ z: { y: 1, x: [3, { b: 1, a: 0 }] } }), '{"z":{"x":[3,{"a":0,"b":1}],"y":1}}');
  eq('jcs literals', jcsCanonicalize({ n: null, t: true, f: false }), '{"f":false,"n":null,"t":true}');
  eq('jcs numbers', jcsCanonicalize([0, -0, 1e21, 1.5]), '[0,0,1e+21,1.5]');
  eq('jcs escaping', jcsCanonicalize({ 'a"b': 'line\n\ttab' }), '{"a\\"b":"line\\n\\ttab"}');
  // UTF-16 code-unit order: uppercase sorts before lowercase, digits before both.
  eq('jcs utf16 order', jcsCanonicalize({ b: 0, B: 0, a: 0, A: 0, 1: 0 }), '{"1":0,"A":0,"B":0,"a":0,"b":0}');
  // Fails closed rather than silently dropping a key.
  let threw = false;
  try { jcsCanonicalize({ a: undefined }); } catch { threw = true; }
  check('jcs rejects undefined', threw);
  threw = false;
  try { jcsCanonicalize(NaN); } catch { threw = true; }
  check('jcs rejects NaN', threw);

  // The exact payload shapes the server signs, rebuilt from published fields.
  const head = { schema_version: 'aether.treehead.v1', tree_size: 500, merkle_root: 'ab'.repeat(32), prev_root: null };
  eq('treeHeadPayload canonical',
    jcsCanonicalize(treeHeadPayload(head)),
    `{"merkle_root":"${'ab'.repeat(32)}","prev_root":null,"schema":"aether.treehead.v1","tree_size":500}`);
  check('keysDocumentPayload shape',
    jcsCanonicalize(keysDocumentPayload({ schema: 'aether.keys.v1', keys: [{ key_id: 'k', algorithm: 'Ed25519', public_key_pem: 'P', status: 'active' }], legacy_schemes: ['x'] }))
    === '{"keys":[{"algorithm":"Ed25519","key_id":"k","public_key_pem":"P","status":"active"}],"legacy_schemes":["x"],"schema":"aether.keys.v1"}');
}

// ————————————————————————————————— 3. Cross-check vs the shipping merkle.js
{
  let mismatches = 0;
  let sharedDisagreements = 0;
  for (let n = 1; n <= 33; n++) {
    const leaves = Array.from({ length: n }, (_, i) => `sf2x_leaf_${n}_${i}`);
    const root = await merkleRoot(leaves);
    for (let i = 0; i < n; i++) {
      const proof = await inclusionProof(leaves, i);
      const ours = await verifyInclusion(proof, root, leaves[i]);
      if (!ours.verified) mismatches++;
      if (ours.computedRoot !== root) mismatches++;
      if (ours.steps.length !== proof.siblings.length) mismatches++;
      // Every recorded step must be a real re-hash of its two operands.
      for (const s of ours.steps) {
        if (await nodeHash(s.left, s.right) !== s.out) mismatches++;
        const usedLeft = s.siblingSide === 'left';
        if ((usedLeft ? s.left : s.right) !== s.usedSibling) mismatches++;
      }
      // The last step's output is the root (or, for n === 1, the leaf itself is).
      const last = ours.steps.length ? ours.steps[ours.steps.length - 1].out : ours.computedLeafHash;
      if (last !== root) mismatches++;
      if (await sharedVerify(proof, root) !== ours.verified) sharedDisagreements++;
    }
  }
  check('fold matches shared/merkle.js for every index of sizes 1..33', mismatches === 0, `${mismatches} mismatches`);
  check('verdict agrees with shared verifyInclusion', sharedDisagreements === 0, `${sharedDisagreements} disagreements`);
}

// ————————————————————————————————— 4. Tamper detection
{
  const leaves = Array.from({ length: 17 }, (_, i) => `leaf-${i}`);
  const root = await merkleRoot(leaves);
  const good = await inclusionProof(leaves, 6);

  const flipped = { ...good, siblings: good.siblings.map((s, i) => (i === 1 ? 'ff'.repeat(32) : s)) };
  const r1 = await verifyInclusion(flipped, root, leaves[6]);
  check('flipped sibling rejected', !r1.verified && r1.failedStep === 'root');

  const wrongIndex = { ...good, index: 7 };
  const r2 = await verifyInclusion(wrongIndex, root, leaves[6]);
  check('wrong index rejected', !r2.verified);

  const r3 = await verifyInclusion(good, root, 'leaf-9');
  check('wrong leaf material rejected', !r3.verified && r3.failedStep === 'leaf');

  const short = { ...good, siblings: good.siblings.slice(0, 2) };
  const r4 = await verifyInclusion(short, root, leaves[6]);
  check('truncated path rejected', !r4.verified && (r4.failedStep === 'height' || r4.failedStep === 'root'));

  const long = { ...good, siblings: [...good.siblings, 'aa'.repeat(32), 'bb'.repeat(32), 'cc'.repeat(32)] };
  const r5 = await verifyInclusion(long, root, leaves[6]);
  check('overlong path rejected', !r5.verified);

  const swapped = { ...good, siblings: [...good.siblings].reverse() };
  const r6 = await verifyInclusion(swapped, root, leaves[6]);
  check('reordered siblings rejected', !r6.verified);

  const badHex = { ...good, siblings: ['zz'.repeat(32), ...good.siblings.slice(1)] };
  const r7 = await verifyInclusion(badHex, root, leaves[6]);
  check('non-hex sibling rejected', !r7.verified && r7.failedStep === 'sibling:0');

  const outOfRange = { ...good, index: 99 };
  check('out-of-range index rejected', !(await verifyInclusion(outOfRange, root, leaves[6])).verified);

  const wrongRoot = await verifyInclusion(good, 'de'.repeat(32), leaves[6]);
  check('wrong root rejected', !wrongRoot.verified && wrongRoot.failedStep === 'root');

  check('happy path still verifies', (await verifyInclusion(good, root, leaves[6])).verified);

  // Second-preimage: an internal node offered as a leaf must not verify — this is
  // exactly what the 0x00/0x01 domain separation exists to prevent.
  const twoRoot = await merkleRoot(['x', 'y']);
  const asLeaf = await leafHash(twoRoot);
  check('internal node is not a valid leaf', asLeaf !== twoRoot);
}

// ————————————————————————————————— 5. Ed25519 round-trip
{
  check('Ed25519 detected in this runtime', await ed25519Supported());

  const pair = await webcrypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const spki = new Uint8Array(await webcrypto.subtle.exportKey('spki', pair.publicKey));
  const b64 = Buffer.from(spki).toString('base64').match(/.{1,64}/g).join('\n');
  const pem = `-----BEGIN PUBLIC KEY-----\n${b64}\n-----END PUBLIC KEY-----`;

  // The Aether convention: sign the UTF-8 bytes of the payload-hash HEX STRING.
  const payload = { schema: 'aether.treehead.v1', tree_size: 500, merkle_root: 'ab'.repeat(32), prev_root: null };
  const { canonical, hash } = await canonicalPayloadHash(payload);
  check('canonical string is sorted', canonical.startsWith('{"merkle_root"'));

  const sigBytes = new Uint8Array(await webcrypto.subtle.sign({ name: 'Ed25519' }, pair.privateKey, new TextEncoder().encode(hash)));
  const artifact = 'sf2x_ed25519_' + Buffer.from(sigBytes).toString('base64url');

  const ok = await verifyEd25519(hash, artifact, pem);
  check('Ed25519 round-trip verifies', ok.supported && ok.valid, ok.reason || '');

  const wrongHash = await verifyEd25519(await sha256Hex('other'), artifact, pem);
  check('Ed25519 rejects a different payload hash', wrongHash.supported && !wrongHash.valid);

  const corrupt = 'sf2x_ed25519_' + Buffer.from(sigBytes.map((b, i) => (i === 0 ? b ^ 0xff : b))).toString('base64url');
  check('Ed25519 rejects a corrupted signature', !(await verifyEd25519(hash, corrupt, pem)).valid);

  const legacy = await verifyEd25519(hash, 'sf2x_a1b2c3d4', pem);
  check('legacy artifact reported, not failed silently', !legacy.valid && /legacy/i.test(legacy.reason || ''));

  const shortSig = await verifyEd25519(hash, 'sf2x_ed25519_AAAA', pem);
  check('malformed signature length rejected', !shortSig.valid && /64 bytes/.test(shortSig.reason || ''));

  const badKey = await verifyEd25519(hash, artifact, '-----BEGIN PUBLIC KEY-----\nQUJD\n-----END PUBLIC KEY-----');
  check('unparseable key reported', !badKey.valid);

  // Full sealed-document flow, the way the page runs it.
  const sealed = await verifySealedDocument({ payload, publishedHash: hash, signature: artifact, publicKeyPem: pem });
  check('verifySealedDocument accepts a good seal', sealed.ok, sealed.error || '');

  const tampered = await verifySealedDocument({
    payload: { ...payload, tree_size: 501 }, publishedHash: hash, signature: artifact, publicKeyPem: pem,
  });
  check('verifySealedDocument catches a tampered field', !tampered.ok && tampered.failedStep === 'hash');

  const noKey = await verifySealedDocument({ payload, publishedHash: hash, signature: artifact, publicKeyPem: null });
  check('verifySealedDocument reports a missing key', !noKey.ok && noKey.failedStep === 'key');
}

// ————————————————————————————————— 6. The public warrant seal
{
  const pemFor = async (publicKey) => {
    const spki = new Uint8Array(await webcrypto.subtle.exportKey('spki', publicKey));
    return `-----BEGIN PUBLIC KEY-----\n${Buffer.from(spki).toString('base64').match(/.{1,64}/g).join('\n')}\n-----END PUBLIC KEY-----`;
  };
  const pair = await webcrypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const impostor = await webcrypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const pem = await pemFor(pair.publicKey);
  const impostorPem = await pemFor(impostor.publicKey);
  // The server convention: sign the UTF-8 bytes of the payload-hash HEX STRING.
  const seal = async (hashHex, priv = pair.privateKey) => 'sf2x_ed25519_'
    + Buffer.from(new Uint8Array(await webcrypto.subtle.sign({ name: 'Ed25519' }, priv, new TextEncoder().encode(hashHex)))).toString('base64url');

  // A registry response carrying exactly the published material the contract names.
  const published = {
    warrant_id: '6a6de04b26cf84c8aa37847f',
    answer_version_id: 'av_9f2c4d18e7b04a6c',
    answer_text_sha256: await sha256Hex('the answer text, as persisted'),
    conclusion_sha256: await sha256Hex('the conclusion, as persisted'),
    premises_sha256: await sha256Hex(jcsCanonicalize(['premise one', 'premise two'])),
    sources_sha256: await sha256Hex(jcsCanonicalize(['https://example.org/a', 'https://example.org/b'])),
    created_date: '2026-08-12T10:45:00.000Z',
  };
  const payload = publicWarrantPayload(published);
  const canonical = jcsCanonicalize(payload);
  const hash = await sha256Hex(canonical);

  eq('public payload carries exactly 8 keys', Object.keys(payload).length, 8);
  eq('public payload schema is pinned, not adopted', payload.schema, 'aether.warrant.public.v1');
  check('public payload canonical is key-sorted', canonical.startsWith('{"answer_text_sha256":'));
  check('no content field leaks into the payload', !/conclusion":|premises":|sources":/.test(canonical));

  // Determinism: input key order and unrelated published fields must not move a byte.
  const shuffled = { signature_valid: true, validity_status: 'valid' };
  for (const k of Object.keys(published).reverse()) shuffled[k] = published[k];
  eq('rebuild is key-order and noise independent', jcsCanonicalize(publicWarrantPayload(shuffled)), canonical);
  eq('rebuild is stable across calls', jcsCanonicalize(publicWarrantPayload(published)), canonical);

  // A hole in the record fails closed — never a '' hashed in the missing field's place.
  for (const field of PUBLIC_WARRANT_FIELDS) {
    const holed = { ...published };
    delete holed[field];
    check(`missing ${field} → no payload`, publicWarrantPayload(holed) === null);
    check(`missing ${field} is named back`, missingPublicWarrantFields(holed).includes(field));
  }
  check('a null field is missing, not empty', publicWarrantPayload({ ...published, created_date: null }) === null);

  const record = {
    ...published,
    publicly_sealed: true,
    public_payload_hash: hash,
    public_seal: await seal(hash),
    public_seal_key_id: 'ed25519:0123456789abcdef',
  };

  const ok = await verifyPublicSeal(record, pem);
  check('public seal verifies from published material alone', ok.valid && ok.supported, ok.reason || '');
  eq('the reported hash is the one computed here', ok.payload_hash, hash);
  check('published hash agreed with the local one', ok.hashMatches === true);
  eq('the key id is surfaced for comparison', ok.keyId, 'ed25519:0123456789abcdef');
  check('uppercase published hash normalizes', (await verifyPublicSeal({ ...record, public_payload_hash: hash.toUpperCase() }, pem)).valid);

  // TAMPER, FIELD BY FIELD. Each signed field is mutated in turn; the seal must
  // break every time — caught at the hash step while the (now stale) published
  // hash is present, and at the signature step once it is removed.
  const survived = [];
  for (const field of PUBLIC_WARRANT_FIELDS) {
    const mutated = field === 'created_date' ? '2026-08-12T10:45:00.001Z' : `${record[field]}0`;
    const withHash = await verifyPublicSeal({ ...record, [field]: mutated }, pem);
    const withoutHash = await verifyPublicSeal({ ...record, [field]: mutated, public_payload_hash: null }, pem);
    if (withHash.valid || withoutHash.valid) survived.push(field);
    if (withHash.failedStep !== 'hash') survived.push(`${field}: hash step reported ${withHash.failedStep}`);
    if (withoutHash.failedStep !== 'signature') survived.push(`${field}: signature step reported ${withoutHash.failedStep}`);
  }
  check('every signed field is tamper-evident', survived.length === 0, survived.join(' · '));

  // The honest non-verdicts. None of these is a failed check, and none may read as one.
  const unsealed = await verifyPublicSeal(published, pem);
  check('an unsealed warrant reports absence', !unsealed.valid && unsealed.sealed === false && unsealed.failedStep === 'unsealed');
  check('absence is worded as pre-dating, not failing', /pre-dates/i.test(unsealed.reason || ''));

  const noArtifact = await verifyPublicSeal({ ...published, publicly_sealed: true }, pem);
  check('sealed-but-no-artifact is reported as the contradiction it is', !noArtifact.valid && noArtifact.failedStep === 'seal');

  const noKey = await verifyPublicSeal(record, null);
  check('a missing public key stops the check, not the page', !noKey.valid && noKey.failedStep === 'key');

  const noPublishedHash = await verifyPublicSeal({ ...record, public_payload_hash: null }, pem);
  check('no published hash still verifies against the local one', noPublishedHash.valid && noPublishedHash.hashMatches === null);

  const staleHash = await verifyPublicSeal({ ...record, public_payload_hash: 'ab'.repeat(32) }, pem);
  check('a published hash that disagrees fails closed', !staleHash.valid && staleHash.failedStep === 'hash');

  const wrongKey = await verifyPublicSeal(record, impostorPem);
  check('a seal checked under another key is rejected', !wrongKey.valid && wrongKey.failedStep === 'signature');

  const forged = await verifyPublicSeal({ ...record, public_seal: await seal(hash, impostor.privateKey) }, pem);
  check('a seal made by another key is rejected', !forged.valid && forged.failedStep === 'signature');

  const legacyArtifact = await verifyPublicSeal({ ...record, public_seal: 'sf2x_a1b2c3d4' }, pem);
  check('a non-Ed25519 artifact is rejected, with its scheme named', !legacyArtifact.valid && /legacy/i.test(legacyArtifact.reason || ''));

  const futureSchema = await verifyPublicSeal({ ...record, public_schema: 'aether.warrant.public.v2' }, pem);
  check('an unknown schema stops the rebuild instead of guessing', !futureSchema.valid && futureSchema.failedStep === 'schema');

  const holedRecord = { ...record };
  delete holedRecord.sources_sha256;
  const holedResult = await verifyPublicSeal(holedRecord, pem);
  check('a hole in the record names the field', !holedResult.valid && holedResult.failedStep === 'payload' && /sources_sha256/.test(holedResult.reason || ''));

  check('a non-object record is refused', !(await verifyPublicSeal(null, pem)).valid);

  // CROSS-IMPLEMENTATION. Seal the same payload with the SHIPPING backend code —
  // shared/canonicalSign.js's canonicalizer and hash, shared/sf2xCore.js's
  // artifact encoding — and verify it with the browser module. This is what
  // proves the two implementations agree; everything above only proves the
  // browser module agrees with itself.
  const pkcs8 = new Uint8Array(await webcrypto.subtle.exportKey('pkcs8', pair.privateKey));
  const privPem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(pkcs8).toString('base64').match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----`;
  eq('server canonicalizer agrees byte for byte', serverJcs(payload), canonical);
  eq('server hash agrees', await serverSha256Hex(canonical), hash);
  const serverSealed = {
    ...record,
    public_payload_hash: await serverSha256Hex(serverJcs(payload)),
    public_seal: await serverSign(hash, { ed25519PrivateKey: privPem }),
  };
  check('server-produced artifact carries the Ed25519 prefix', String(serverSealed.public_seal).startsWith('sf2x_ed25519_'));
  const serverChecked = await verifyPublicSeal(serverSealed, pem);
  check('a seal made by the shipping backend crypto verifies here', serverChecked.valid, serverChecked.reason || '');
}

// ————————————————————————————————— report
console.log(`\n${failures.length ? '✗' : '✓'} proof/verify.js — ${pass} checks passed, ${failures.length} failed`);
for (const f of failures) console.log(`   ✗ ${f}`);
process.exit(failures.length ? 1 : 0);
