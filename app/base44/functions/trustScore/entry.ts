import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';
import { verifySignature, computeTrustworthyRate } from '../../shared/sf2xCore.js';

// Public, read-only trust-score endpoint. Powers the embeddable badge and any
// developer who wants a lightweight trust verdict + verify link for an answer.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;
    const body = await req.json().catch(() => ({}));
    let answerVersionId = (body.answer_version_id || '').toString();
    const inquiryId = (body.inquiry_id || '').toString();
    if (!answerVersionId && !inquiryId) {
      return Response.json({ error: 'answer_version_id or inquiry_id is required' }, { status: 400 });
    }

    let av = null;
    if (answerVersionId) {
      av = await svc.entities.AnswerVersion.get(answerVersionId).catch(() => null);
    } else {
      const versions = await svc.entities.AnswerVersion.filter({ inquiry_id: inquiryId }, 'version', 50);
      av = versions[versions.length - 1] || null;
      if (av) answerVersionId = av.id;
    }
    if (!av) return Response.json({ error: 'Answer version not found' }, { status: 404 });

    let warrant = null;
    if (av.warrant_id) warrant = await svc.entities.Warrant.get(av.warrant_id).catch(() => null);
    let inquiry = null;
    if (av.inquiry_id) inquiry = await svc.entities.Inquiry.get(av.inquiry_id).catch(() => null);

    // Recompute the attestation signature so callers can confirm the seal is intact.
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
    const signatureKeys = { ed25519PublicKey: secrets.get('ED25519_PUBLIC_KEY'), hmacKey: secrets.get('sf2x_attestation_key') };
    for (const c of variants) { if (await verifySignature(c, stored, signatureKeys)) { signature_valid = true; break; } }
    const trust = av.trust_score ?? computeTrustworthyRate(av.metrics || {}, warrant);

    return Response.json({
      answer_version_id: av.id,
      version: av.version,
      trust_score: Math.round(trust),
      warrant: warrant
        ? {
            validity_status: warrant.validity_status,
            confidence_score: warrant.confidence_score,
            premises_count: (warrant.premises || []).length,
            sources_count: (warrant.sources || []).length,
          }
        : null,
      signature_valid,
      inquiry: inquiry
        ? { prompt: inquiry.prompt, domain: inquiry.domain, stakes_level: inquiry.stakes_level }
        : null,
      verify_url: `/verify/${av.id}`,
      scored_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('trustScore error', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}