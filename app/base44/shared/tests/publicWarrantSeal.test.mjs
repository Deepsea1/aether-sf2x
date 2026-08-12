// Conformance harness for the PUBLIC warrant seal in canonicalSign.js
// (aether.warrant.public.v1) — the seal a stranger can check with nothing but a
// warrantRegistry response and the published key document.
//
// The seal is only worth anything if three things hold, so all three are proven
// here rather than asserted in a comment:
//   1. ROUND TRIP — build → canonicalize → hash → sign → verify, against a
//      LOCALLY generated Ed25519 keypair (never a checked-in one), through the
//      real exported signPublicWarrant/verifyPublicWarrant.
//   2. TAMPER — mutating ANY single field of the payload, or any byte of the
//      seal, must fail verification. A seal that survives an edit proves
//      nothing about what it sealed.
//   3. CANONICAL — the payload hash must depend on the VALUES, never on the
//      order the keys were inserted in, and it must match a second,
//      independently written RFC 8785 canonicalizer (node:crypto + hand-rolled
//      JCS) so a shared bug in jcsCanonicalize cannot pass unnoticed.
// Plus the fail-closed cases (absent keys, non-Ed25519 artifact, missing ids)
// and the privacy property: no content ever appears in the signed bytes.
//
// canonicalSign.js reaches for the Ed25519 keys via a dynamic
// import('base44:runtime'), which does not resolve outside Base44 — so this
// harness registers a module hook that serves a stub reading
// globalThis.__SF2X_TEST_SECRETS__. That keeps the code under test verbatim:
// the real signPublicWarrant runs, not a copy of it.
//
// Run: node --test app/base44/shared/tests/publicWarrantSeal.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { createHash, webcrypto } from 'node:crypto';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

// ————————————————————————————————— base44:runtime stub
const HOOKS = `
export async function resolve(specifier, context, next) {
  if (specifier === 'base44:runtime') return { url: 'sf2x-test-runtime:///', shortCircuit: true };
  return next(specifier, context);
}
export async function load(url, context, next) {
  if (url === 'sf2x-test-runtime:///') {
    return {
      format: 'module',
      shortCircuit: true,
      source: "export const secrets = { get: (k) => (globalThis.__SF2X_TEST_SECRETS__ || {})[k] };",
    };
  }
  return next(url, context);
}
`;
register('data:text/javascript,' + encodeURIComponent(HOOKS));

// ————————————————————————————————— a locally generated key, every run
function pem(label, der) {
  const b64 = Buffer.from(der).toString('base64').replace(/(.{64})/g, '$1\n');
  return `-----BEGIN ${label}-----\n${b64}\n-----END ${label}-----\n`;
}
const kp = await webcrypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
const PRIVATE_PEM = pem('PRIVATE KEY', await webcrypto.subtle.exportKey('pkcs8', kp.privateKey));
const PUBLIC_PEM = pem('PUBLIC KEY', await webcrypto.subtle.exportKey('spki', kp.publicKey));

globalThis.__SF2X_TEST_SECRETS__ = { ED25519_PRIVATE_KEY: PRIVATE_PEM, ED25519_PUBLIC_KEY: PUBLIC_PEM };

// canonicalSign caches its key lookup on first use, so a second module instance
// (fresh query string) is how the keyless path gets tested.
const {
  WARRANT_PUBLIC_SCHEMA_V1, buildPublicWarrantPayload, signPublicWarrant, verifyPublicWarrant,
  jcsCanonicalize, sha256Hex,
} = await import('../canonicalSign.js');

// ————————————————————————————————— an independent RFC 8785 + SHA-256
// Deliberately not the implementation under test: node:crypto instead of
// WebCrypto, and a hand-transcribed canonicalizer. If both agree, the hash is
// the payload's, not one code path's opinion of it.
function refJcs(v) {
  if (v === null) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return JSON.stringify(v);
  if (typeof v === 'string') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(refJcs).join(',') + ']';
  const keys = Object.keys(v).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + refJcs(v[k])).join(',') + '}';
}
const refSha = (s) => createHash('sha256').update(String(s), 'utf8').digest('hex');

// ————————————————————————————————— the fixture: a realistic warrant row
const ROW = {
  warrant_id: 'wrt_01J8ZQ4V9K',
  answer_version_id: 'av_01J8ZQ4V9M',
  answer_text_sha256: refSha('The FLSA does not require paid vacation. Policies vary by employer.'),
  conclusion: 'The answer is materially correct but omits the jurisdiction caveat.',
  premises: ['The FLSA does not mandate paid vacation.', 'Employer policy governs accrual.'],
  sources: ['https://www.dol.gov/agencies/whd/flsa', 'https://www.ecfr.gov/current/title-29'],
  created_date: '2026-08-12T14:03:11.482Z',
};
const PAYLOAD_KEYS = [
  'schema', 'warrant_id', 'answer_version_id', 'answer_text_sha256',
  'conclusion_sha256', 'premises_sha256', 'sources_sha256', 'created_date',
];

const payload = await buildPublicWarrantPayload(ROW);

test('payload is exactly the pinned shape — no content fields, no extras', () => {
  assert.deepEqual(Object.keys(payload).sort(), [...PAYLOAD_KEYS].sort());
  assert.equal(payload.schema, WARRANT_PUBLIC_SCHEMA_V1);
  assert.equal(payload.schema, 'aether.warrant.public.v1');
  assert.equal(payload.warrant_id, ROW.warrant_id);
  assert.equal(payload.answer_version_id, ROW.answer_version_id);
  assert.equal(payload.answer_text_sha256, ROW.answer_text_sha256);
  assert.equal(payload.created_date, ROW.created_date);
});

test('the content hashes are the pinned recipe, cross-checked independently', async () => {
  assert.equal(payload.conclusion_sha256, refSha(ROW.conclusion));
  assert.equal(payload.premises_sha256, refSha(refJcs(ROW.premises)));
  assert.equal(payload.sources_sha256, refSha(refJcs(ROW.sources)));
  // …and the module's own primitives agree with the reference implementation.
  assert.equal(await sha256Hex(ROW.conclusion), refSha(ROW.conclusion));
  assert.equal(jcsCanonicalize(ROW.premises), refJcs(ROW.premises));
});

test('PRIVACY: no content survives into the signed bytes', () => {
  const signed = jcsCanonicalize(payload);
  for (const secret of [ROW.conclusion, ...ROW.premises, ...ROW.sources]) {
    assert.ok(!signed.includes(secret), `content leaked into the signed payload: ${secret}`);
    // and not in fragments either — check the first distinctive token
    const token = secret.split(/[\s/]+/).find((t) => t.length > 8);
    if (token) assert.ok(!signed.includes(token), `content fragment leaked: ${token}`);
  }
});

test('CANONICAL: the hash depends on values, never on key insertion order', async () => {
  // Same payload, keys inserted in reverse — RFC 8785 sorts by UTF-16 code
  // unit, so both must canonicalize (and hash) identically.
  const shuffled = {};
  for (const k of [...PAYLOAD_KEYS].reverse()) shuffled[k] = payload[k];
  assert.notDeepEqual(Object.keys(shuffled), Object.keys(payload));
  assert.equal(jcsCanonicalize(shuffled), jcsCanonicalize(payload));
  assert.equal(await sha256Hex(jcsCanonicalize(shuffled)), await sha256Hex(jcsCanonicalize(payload)));
  // And a second insertion order (interleaved) lands on the same string.
  const interleaved = {};
  for (const k of ['created_date', 'schema', 'sources_sha256', 'warrant_id', 'premises_sha256', 'answer_version_id', 'conclusion_sha256', 'answer_text_sha256']) {
    interleaved[k] = payload[k];
  }
  assert.equal(jcsCanonicalize(interleaved), jcsCanonicalize(payload));
  // The canonical form matches the independent canonicalizer byte for byte.
  assert.equal(jcsCanonicalize(payload), refJcs(payload));
});

test('ORDER MATTERS inside the arrays — premises are a sequence, not a set', async () => {
  const reversed = await buildPublicWarrantPayload({ ...ROW, premises: [...ROW.premises].reverse() });
  assert.notEqual(reversed.premises_sha256, payload.premises_sha256);
});

test('ROUND TRIP: build → hash → sign → verify with a locally generated key', async () => {
  const sealed = await signPublicWarrant(payload);
  assert.ok(sealed, 'signPublicWarrant returned null with keys present');
  assert.equal(sealed.schema, WARRANT_PUBLIC_SCHEMA_V1);
  assert.equal(sealed.public_payload_hash, await sha256Hex(jcsCanonicalize(payload)));
  assert.equal(sealed.public_payload_hash, refSha(refJcs(payload)));
  assert.match(sealed.public_seal, /^sf2x_ed25519_/);
  assert.match(sealed.public_seal_key_id, /^ed25519:[0-9a-f]{16}$/);
  assert.equal(sealed.public_seal_key_id, 'ed25519:' + refSha(PUBLIC_PEM).slice(0, 16));
  assert.equal(await verifyPublicWarrant(payload, sealed.public_seal), true);

  // The offline check a third party performs: rebuild from published fields
  // only, then verify the raw Ed25519 signature with the published key.
  const rebuilt = {
    schema: 'aether.warrant.public.v1',
    warrant_id: ROW.warrant_id,
    answer_version_id: ROW.answer_version_id,
    answer_text_sha256: ROW.answer_text_sha256,
    conclusion_sha256: payload.conclusion_sha256,
    premises_sha256: payload.premises_sha256,
    sources_sha256: payload.sources_sha256,
    created_date: ROW.created_date,
  };
  const rebuiltHash = refSha(refJcs(rebuilt));
  assert.equal(rebuiltHash, sealed.public_payload_hash);
  const sigB64 = sealed.public_seal.slice('sf2x_ed25519_'.length).replace(/-/g, '+').replace(/_/g, '/');
  const ok = await webcrypto.subtle.verify(
    { name: 'Ed25519' }, kp.publicKey,
    Buffer.from(sigB64 + '==='.slice((sigB64.length + 3) % 4), 'base64'),
    Buffer.from(rebuiltHash, 'utf8'),
  );
  assert.equal(ok, true, 'raw Ed25519 verification of the rebuilt payload hash failed');
});

test('TAMPER: changing any single payload field breaks verification', async () => {
  const sealed = await signPublicWarrant(payload);
  let checked = 0;
  for (const key of PAYLOAD_KEYS) {
    const original = payload[key];
    // A hex-digest field flips its last nibble; the others get a suffix.
    const mutated = /^[0-9a-f]{64}$/.test(original)
      ? original.slice(0, 63) + (original.at(-1) === 'a' ? 'b' : 'a')
      : original + 'x';
    const bad = { ...payload, [key]: mutated };
    assert.notEqual(jcsCanonicalize(bad), jcsCanonicalize(payload), `mutation of ${key} did not change the payload`);
    assert.equal(await verifyPublicWarrant(bad, sealed.public_seal), false, `tampered ${key} still verified`);
    checked++;
  }
  assert.equal(checked, 8);

  // Dropping a field, or smuggling one in, must also fail.
  const { created_date, ...missing } = payload;
  assert.equal(await verifyPublicWarrant(missing, sealed.public_seal), false);
  assert.equal(await verifyPublicWarrant({ ...payload, extra: 1 }, sealed.public_seal), false);
});

test('TAMPER: mutating the seal itself breaks verification', async () => {
  const sealed = await signPublicWarrant(payload);
  const body = sealed.public_seal.slice('sf2x_ed25519_'.length);
  const flipped = 'sf2x_ed25519_' + (body[0] === 'A' ? 'B' : 'A') + body.slice(1);
  assert.equal(await verifyPublicWarrant(payload, flipped), false);
  assert.equal(await verifyPublicWarrant(payload, 'sf2x_ed25519_' + body.slice(0, -4)), false);
  assert.equal(await verifyPublicWarrant(payload, ''), false);
  assert.equal(await verifyPublicWarrant(payload, null), false);
  // Fail closed on the schemes that are NOT publicly checkable.
  assert.equal(await verifyPublicWarrant(payload, 'sf2x_sig_' + body), false);
  assert.equal(await verifyPublicWarrant(payload, 'sf2x_deadbeefdeadbeef'), false);
});

test('REPLAY: one warrant\'s seal never validates another warrant', async () => {
  const sealed = await signPublicWarrant(payload);
  const other = await buildPublicWarrantPayload({ ...ROW, warrant_id: 'wrt_OTHER' });
  assert.equal(await verifyPublicWarrant(other, sealed.public_seal), false);
  const otherSealed = await signPublicWarrant(other);
  assert.equal(await verifyPublicWarrant(payload, otherSealed.public_seal), false);
  assert.notEqual(otherSealed.public_payload_hash, sealed.public_payload_hash);
});

test('FAIL CLOSED: an unrebuildable payload is never signed', async () => {
  for (const field of ['warrant_id', 'answer_version_id', 'answer_text_sha256', 'created_date']) {
    for (const bad of [undefined, null, '', 42, {}]) {
      await assert.rejects(
        () => buildPublicWarrantPayload({ ...ROW, [field]: bad }),
        /must be a non-empty string/,
        `${field}=${JSON.stringify(bad)} was accepted`,
      );
    }
  }
  // Absent/odd content still seals — an empty conclusion and no sources are
  // legitimate states, and they hash to the empty-string / empty-array digests.
  const sparse = await buildPublicWarrantPayload({ ...ROW, conclusion: undefined, premises: undefined, sources: null });
  assert.equal(sparse.conclusion_sha256, refSha(''));
  assert.equal(sparse.premises_sha256, refSha('[]'));
  assert.equal(sparse.sources_sha256, refSha('[]'));
  assert.ok(await signPublicWarrant(sparse));
});

test('FAIL CLOSED: no Ed25519 keys means no seal — never an HMAC stand-in', async () => {
  const saved = globalThis.__SF2X_TEST_SECRETS__;
  globalThis.__SF2X_TEST_SECRETS__ = { sf2x_attestation_key: 'an-hmac-key-that-must-not-be-used' };
  try {
    // Fresh module instance: the key lookup is cached per module.
    const keyless = await import('../canonicalSign.js?keyless');
    const p = await keyless.buildPublicWarrantPayload(ROW);
    assert.equal(await keyless.signPublicWarrant(p), null);
    // …and the verify path refuses too, rather than reporting a pass it cannot back.
    const sealedElsewhere = (await signPublicWarrant(payload)).public_seal;
    assert.equal(await keyless.verifyPublicWarrant(payload, sealedElsewhere), false);
  } finally {
    globalThis.__SF2X_TEST_SECRETS__ = saved;
  }
});

test('DETERMINISM: the same row always seals to the same hash', async () => {
  const a = await buildPublicWarrantPayload(ROW);
  const b = await buildPublicWarrantPayload({ ...ROW });
  assert.deepEqual(a, b);
  assert.equal((await signPublicWarrant(a)).public_payload_hash, (await signPublicWarrant(b)).public_payload_hash);
});
