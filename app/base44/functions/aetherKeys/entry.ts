import { secrets } from 'base44:runtime';
import { signWarrantV2, publicKeyId } from '../../shared/canonicalSign.js';

// Public key-discovery endpoint (MASTER_PLAN v5 §9.3) — the live document
// behind /.well-known/aether-keys.json (a static pointer; Vite serves it from
// app/public/). Publishes the current Ed25519 verification key so anyone can
// check a warrant signature offline, with nothing from us but this document.
// No auth (transparency), GET or POST, PUBLIC key material only — the private
// key never leaves secrets and is only presence-checked here, never read.
//
// SELF-SIGNING BOOTSTRAP: payload_hash/signature sign the canonical
// { schema, keys, legacy_schemes } with the SAME key the document publishes.
// That proves transport integrity (a tampered document fails verification),
// not key authenticity — a first fetch must anchor trust in the serving
// domain + the transparency log (§10). Key rotation adds cross-signatures:
// the outgoing key signs the document that introduces its successor, so
// verifiers can walk the chain instead of re-anchoring.

export default async function (req) {
  try {
    const publicKeyPem = secrets.get('ED25519_PUBLIC_KEY');
    // Fail closed: without the keypair there is nothing honest to publish —
    // an unsigned or HMAC-"signed" key document would defeat its own purpose.
    if (!publicKeyPem || !secrets.get('ED25519_PRIVATE_KEY')) {
      return Response.json({ error: 'Ed25519 keys are not configured — key discovery is unavailable.' }, { status: 503 });
    }

    const payload = {
      schema: 'aether.keys.v1',
      keys: [
        {
          key_id: await publicKeyId(),
          algorithm: 'Ed25519',
          public_key_pem: publicKeyPem,
          status: 'active',
        },
      ],
      // Pre-v2 warrant seals that CANNOT be verified from public material:
      // HMAC verifies server-side only (publishing the key makes it forgeable)
      // and the FNV fingerprint is a content checksum, not a signature.
      legacy_schemes: ['HMAC-SHA256 server-attested', 'FNV fingerprint'],
    };

    // signWarrantV2 fails closed to null when the keys are unusable — never
    // publish an unattested (or non-Ed25519) key document.
    const signed = await signWarrantV2(payload);
    if (!signed || !String(signed.signed_hash_v2 || '').startsWith('sf2x_ed25519_')) {
      return Response.json({ error: 'Ed25519 signing unavailable — refusing to publish an unattested key document.' }, { status: 503 });
    }

    return Response.json({
      schema: payload.schema,
      generated_note: 'Self-signed bootstrap: payload_hash = SHA-256 of the RFC 8785 (JCS) canonicalization of { schema, keys, legacy_schemes }; signature = Ed25519 over the UTF-8 bytes of that hex hash, by the key this document publishes. Verifies transport integrity; anchor first-fetch trust in the domain + transparency log. Rotation adds cross-signatures from the outgoing key.',
      keys: payload.keys,
      legacy_schemes: payload.legacy_schemes,
      payload_hash: signed.payload_hash_v2,
      signature: signed.signed_hash_v2,
    });
  } catch (error) {
    console.error('aetherKeys error', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
