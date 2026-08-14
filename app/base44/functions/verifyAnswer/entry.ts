import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';
import { verifySignature, signatureScheme, computeTrustworthyRate } from '../../shared/sf2xCore.js';
import { isCertifiedRun } from '../../shared/redTeam.js';
import { buildWarrantV2Payload, verifyWarrantV2 } from '../../shared/canonicalSign.js';
import { createTruthDecision, exposeTruthDecision, modelAssessedDecision } from '../../shared/truthContract.js';

// PUBLIC AND UNAUTHENTICATED BY DESIGN — this is not a missing auth check.
// It backs the public proof surface (/verify/:id, Registry, WarrantProof, Badge,
// EmbedBadge): anyone holding a lineage id can independently confirm the warrant and
// its signature. Independently verifiable warrants are the product.
// It serves a curated field subset for ONE already-known id and cannot enumerate —
// which is why it is safe while AnswerVersion's restrictive RLS stays in place.
// Before adding an ownership gate here, read the RLS SCOPE note in
// entities/AnswerVersion.jsonc: AnswerVersions created via the service-role API paths
// do not carry the API caller in created_by_id, so such a gate would 404 real customers.

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;
    const body = await req.json().catch(() => ({}));
    const id = (body.answer_version_id || body.id || '').toString();
    if (!id) return Response.json({ error: 'answer_version_id is required' }, { status: 400 });

    const av = await svc.entities.AnswerVersion.get(id).catch(() => null);
    if (!av) return Response.json({ error: 'Answer version not found' }, { status: 404 });

    let warrant = null;
    if (av.warrant_id) warrant = await svc.entities.Warrant.get(av.warrant_id).catch(() => null);
    let inquiry = null;
    if (av.inquiry_id) inquiry = await svc.entities.Inquiry.get(av.inquiry_id).catch(() => null);

    // Recompute the expected signature across all supported signing layouts.
    const p = ((warrant && warrant.premises) || []).join(';;');
    const s = ((warrant && warrant.sources) || []).join(';;');
    const concl = (warrant && warrant.conclusion) || '';
    const ans = av.answer_text || '';
    const variants = [
      [av.id, concl, p].join('|'),
      [av.id, ans, p, s].join('|'),
      [av.id, concl, p, s].join('|'),
      [av.id, ans, '', s].join('|'),   // warrantApi/MCP path: premises signed as empty
    ];
    const stored = (warrant && warrant.signed_hash) || '';
    let signature_valid = false;
    let scheme = signatureScheme(stored);

    // Prefer the v2 signature (§9.3/§23.3). API- and widget-path warrants carry
    // ONLY the RFC 8785 v2 fields — no legacy signed_hash — so checking legacy
    // alone reported scheme 'none' + signature_valid:false for warrants this
    // pipeline had correctly signed. A real proof displayed as forged is the
    // inverse of the honesty law, and it is the public proof page (/verify/:id,
    // Registry, WarrantProof, badges) that reads this field.
    if (warrant && warrant.signed_hash_v2 && warrant.answer_text_sha256) {
      const v2Valid = await verifyWarrantV2(
        buildWarrantV2Payload({
          answer_version_id: av.id,
          answer_text_sha256: warrant.answer_text_sha256,
          conclusion: warrant.conclusion || '',
          premises: warrant.premises || [],
          sources: warrant.sources || [],
        }),
        warrant.signed_hash_v2,
      );
      if (v2Valid) {
        signature_valid = true;
        scheme = 'Ed25519 (RFC 8785 v2)';
      }
    }

    // Legacy fallback — dual-signed and pre-v2 warrants verify exactly as before.
    if (!signature_valid && stored) {
      const signatureKeys = { ed25519PublicKey: secrets.get('ED25519_PUBLIC_KEY'), hmacKey: secrets.get('sf2x_attestation_key') };
      for (const candidate of variants) { if (await verifySignature(candidate, stored, signatureKeys)) { signature_valid = true; break; } }
    }

    // Certification: only tribunal lineages that ran the red-team stress test
    // (default stage) and resisted/wobbled are certified. Single-model and
    // inbound-attestation lineages that skipped red-team are uncertified.
    const redTeamRuns = await svc.entities.RedTeamRun.filter({ target_id: av.id }).catch(() => []);
    const certified = isCertifiedRun(av, redTeamRuns);
    const storedDecision = av.cognitive_state?.truth_decision || modelAssessedDecision({
      policyId: 'public-warrant-model-assessment',
      policyVersion: '1',
      missingEvidence: ['The answer version has no independently evaluated factual decision.'],
    });
    const truthDecision = createTruthDecision({
      ...storedDecision,
      integrity_status: signature_valid ? 'VERIFIED' : 'UNAVAILABLE',
      action_authorization: signature_valid ? storedDecision.action_authorization : 'NOT_AUTHORIZED',
      policy_id: 'public-warrant-integrity-check',
      policy_version: '1',
      satisfied_rules: signature_valid ? ['warrant_signature_reconstructed_and_verified'] : [],
      failed_rules: signature_valid ? [] : ['warrant_signature_unavailable_or_invalid'],
    });

    return Response.json({
      answer_version_id: av.id,
      version: av.version,
      inquiry: inquiry
        ? { id: inquiry.id, prompt: inquiry.prompt, domain: inquiry.domain, stakes_level: inquiry.stakes_level, status: inquiry.status, created_date: inquiry.created_date }
        : null,
      answer_text: av.answer_text,
      trust_score: av.trust_score ?? computeTrustworthyRate(av.metrics || {}, warrant),
      warrant: warrant
        ? {
            premises: warrant.premises,
            conclusion: warrant.conclusion,
            confidence_score: warrant.confidence_score,
            validity_status: warrant.validity_status,
            sources: warrant.sources,
            authoritative_grounding: warrant.authoritative_grounding || null,
            grounding_notes: warrant.grounding_notes || '',
            expiry_date: warrant.expiry_date,
          }
        : null,
      signed_hash: stored,
      // v2 material so an offline verifier can recompute the canonical payload
      // hash without this endpoint (§10): the signature it was checked against
      // and the key that signed it.
      signed_hash_v2: (warrant && warrant.signed_hash_v2) || null,
      payload_hash_v2: (warrant && warrant.payload_hash_v2) || null,
      key_id_v2: (warrant && warrant.key_id_v2) || null,
      answer_text_sha256: (warrant && warrant.answer_text_sha256) || null,
      signature_scheme: scheme,
      signature_public_key: scheme === 'Ed25519' ? secrets.get('ED25519_PUBLIC_KEY') : null,
      signature_valid,
      certified,
      certification: certified ? 'certified' : 'uncertified',
      verified_at: new Date().toISOString(),
      ...exposeTruthDecision(truthDecision),
    });
  } catch (error) {
    console.error('verifyAnswer error', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
