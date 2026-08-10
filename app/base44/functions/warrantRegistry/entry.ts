import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';
// CLI bundling: functions are standalone — signature helpers ride inside the
// function dir (verbatim copy of sf2xCore.js's signature block; see sf2xVerify.ts).
import { verifySignature, signatureScheme } from './sf2xVerify.ts';
import { WARRANT_SCHEMA_V2, jcsCanonicalize, sha256Hex, buildWarrantV2Payload, verifyWarrantV2 } from '../../shared/canonicalSign.js';
import { merkleRoot, inclusionProof } from '../../shared/merkle.js';

// Public, read-only Warrant Registry — an append-only transparency log. Anyone
// can independently verify a warrant's cryptographic signature and inspect the
// chain. The chain root hash is tamper-evident: any insertion, removal, or
// modification of a warrant changes it. No auth required (transparency).
// Publishes integrity METADATA only — never warrant content (see the privacy
// boundary note at the verified_warrant block below).

async function sha256hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text ?? '')));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// The signing content varies by attestation flow (inquire vs warrantApi). Try all
// known variants so verification is robust regardless of which flow produced it.
function signingVariants(w, av) {
  const p = (w.premises || []).join(';;');
  const s = (w.sources || []).join(';;');
  const concl = w.conclusion || '';
  const ans = av.answer_text || '';
  return [
    [av.id, concl, p].join('|'),
    [av.id, ans, p, s].join('|'),
    [av.id, concl, p, s].join('|'),
    [av.id, ans, '', s].join('|'),   // warrantApi/MCP path: premises signed as empty
  ];
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Number(body.limit) || 100, 500);

    const warrants = await svc.entities.Warrant.list('-created_date', limit);
    // Deterministic leaf order: created_date ascending with id as tie-break —
    // reversing '-created_date' is not stable when timestamps collide, and both
    // roots below must be reproducible from the chain listing alone.
    const ascending = [...warrants].sort((a, b) => {
      const at = String(a.created_date || '');
      const bt = String(b.created_date || '');
      if (at !== bt) return at < bt ? -1 : 1;
      return String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0;
    });
    const leaves = ascending.map((w) => w.signed_hash || w.id);
    // Legacy linear root (kept for existing consumers) + the RFC 6962 Merkle
    // root over the SAME leaves (MASTER_PLAN v5 §9.3/§10): the Merkle tree
    // admits O(log n) inclusion proofs; the linear hash cannot.
    const root = await sha256hex(leaves.join('|'));
    const merkle_root = await merkleRoot(leaves);

    let verified = null;
    // Lookup accepts warrant_id, verification_id, lineage_id (answer_version_id),
    // or signed_hash (the signature artifact itself — what embeds/badges carry).
    let w = null;
    if (body.warrant_id) {
      w = await svc.entities.Warrant.get(body.warrant_id).catch(() => null);
    }
    if (!w && body.signed_hash) {
      const found = await svc.entities.Warrant.filter({ signed_hash: String(body.signed_hash) }, '-created_date', 1).catch(() => []);
      w = (found && found[0]) || null;
    }
    if (!w) {
      const lid = body.verification_id || body.lineage_id;
      if (lid) {
        w = await svc.entities.Warrant.get(lid).catch(() => null);
        if (!w) {
          const found = await svc.entities.Warrant.filter({ answer_version_id: lid }, '-created_date', 1).catch(() => []);
          w = (found && found[0]) || null;
        }
      }
    }
    if (w) {
      const av = await svc.entities.AnswerVersion.get(w.answer_version_id).catch(() => null);
      const stored = w.signed_hash || '';
      let valid = false;
      let scheme = signatureScheme(stored);
      let payloadHashV2 = null;
      // v2 first (MASTER_PLAN v5 §9.3): reconstruct the RFC 8785 canonical
      // payload FROM THE ENTITIES — not from a stored blob — and verify the
      // Ed25519 signature over its hash. Reconstruction is the point: success
      // proves the signature binds this row's persisted content. On any
      // reconstruction gap, fall through to the legacy brute-force unchanged.
      if (w.signed_hash_v2) {
        const answerTextSha256 = w.answer_text_sha256 || (av ? await sha256Hex(av.answer_text) : null);
        if (answerTextSha256) {
          const payload = buildWarrantV2Payload({
            answer_version_id: w.answer_version_id,
            answer_text_sha256: answerTextSha256,
            conclusion: w.conclusion || '',
            premises: w.premises || [],
            sources: w.sources || [],
          });
          if (await verifyWarrantV2(payload, w.signed_hash_v2)) {
            valid = true;
            scheme = 'Ed25519-JCS-v2';
            payloadHashV2 = await sha256Hex(jcsCanonicalize(payload));
          }
        }
      }
      if (!valid && av && stored) {
        const signatureKeys = { ed25519PublicKey: secrets.get('ED25519_PUBLIC_KEY'), hmacKey: secrets.get('sf2x_attestation_key') };
        for (const candidate of signingVariants(w, av)) {
          if (await verifySignature(candidate, stored, signatureKeys)) { valid = true; break; }
        }
      }
      // Inclusion proof over the SAME ordered leaf set as merkle_root above —
      // a warrant older than the current listing window gets null, never a
      // proof against a root it is not actually in.
      const leafIndex = ascending.findIndex((entry) => entry.id === w.id);
      const inclusion = leafIndex >= 0 ? await inclusionProof(leaves, leafIndex) : null;
      // PRIVACY BOUNDARY (P1 hardening — MASTER_PLAN v5 §9.2): this endpoint is
      // unauthenticated and reads via service role, so it publishes integrity
      // metadata ONLY — signature verdict, hashes, counts, tribunal roles. It
      // must never return warrant CONTENT (premises, conclusion, sources, claim
      // text, snapshots, answer/prompt excerpts): the chain below makes every
      // warrant enumerable, so content here would make every customer inquiry
      // readable without auth — the same data class as the searchClaims pr_diff
      // leak (fixed in eec0253). Full content stays on the authenticated app
      // surfaces that go through entity RLS. Follow-up: add tenant_id +
      // is_public to Warrant for owner-scoped and opted-in public detail.
      verified = {
        warrant_id: w.id,
        answer_version_id: w.answer_version_id,
        created_date: w.created_date,
        validity_status: w.validity_status,
        confidence_score: w.confidence_score,
        expiry_date: w.expiry_date || null,
        premises_count: (w.premises || []).length,
        sources_count: (w.sources || []).length,
        claims_count: (w.claims || []).length,
        issues_count: (w.issues || []).length,
        evidence_preserved: (w.source_snapshots || []).length,
        signed_hash: stored,
        signature_valid: valid,
        signature_scheme: scheme,
        // v2 metadata — the schema the payload was canonicalized under, the
        // recomputed (verified) payload hash, and which key signed it. All
        // integrity metadata, no content. Null on pre-v2 warrants.
        schema_version: scheme === 'Ed25519-JCS-v2' ? WARRANT_SCHEMA_V2 : (w.schema_version || null),
        payload_hash_v2: payloadHashV2 || w.payload_hash_v2 || null,
        key_id: w.key_id_v2 || null,
        // HMAC + fingerprint schemes verify server-side only (the key can't be
        // published without becoming forgeable) — say so instead of implying more.
        publicly_verifiable: scheme === 'Ed25519' || scheme === 'Ed25519-JCS-v2',
        signature_public_key: scheme === 'Ed25519' || scheme === 'Ed25519-JCS-v2' ? secrets.get('ED25519_PUBLIC_KEY') : null,
        verifier_lineage: w.roles || [],
        support_confidence: w.support_confidence ?? null,
        detectability_confidence: w.detectability_confidence ?? null,
        verify_url: `/verify/${w.answer_version_id}`,
        inclusion_proof: inclusion,
      };
    }

    const chain = warrants.map((w) => ({
      warrant_id: w.id,
      created_date: w.created_date,
      answer_version_id: w.answer_version_id,
      validity_status: w.validity_status,
      confidence_score: w.confidence_score,
      sources_count: (w.sources || []).length,
      premises_count: (w.premises || []).length,
      signed_hash: w.signed_hash,
      evidence_preserved: (w.source_snapshots || []).length,
    }));

    return Response.json({
      registry: 'sf2x_warrants',
      root,
      merkle_root,
      tree_size: leaves.length,
      count: chain.length,
      chain,
      verified_warrant: verified,
      note: 'Append-only transparency log. Any insertion, removal, or modification of a warrant changes the root hash. Verify any warrant signature independently via warrant_id. merkle_root is the RFC 6962 tree head over the same leaves — inclusion proofs verify against it with nothing but SHA-256.',
    });
  } catch (error) {
    console.error('warrantRegistry error', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}