import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';
import { requireAdmin } from '../../shared/auth.js';
import { verifySignature, signatureScheme } from '../../shared/sf2xCore.js';
import { exposeTruthDecision, modelAssessedDecision } from '../../shared/truthContract.js';

// Enterprise audit evidence pack. Admin-only. Assembles the complete, auditable
// decision record for a warrant or inquiry: inquiry, answer version (full text),
// warrant (premises, sources, preserved evidence snapshots), signature
// verification, debate, review, audit log, and telemetry spans — everything a
// third-party auditor needs to reconstruct and verify the decision.

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
    const guard = await requireAdmin(base44);
    if (!guard.ok) return guard.response;
    const svc = base44.asServiceRole;
    const body = await req.json().catch(() => ({}));

    let warrant = null, av = null, inquiry = null;
    if (body.warrant_id) {
      warrant = await svc.entities.Warrant.get(body.warrant_id).catch(() => null);
      if (!warrant) return Response.json({ error: 'Warrant not found' }, { status: 404 });
      av = await svc.entities.AnswerVersion.get(warrant.answer_version_id).catch(() => null);
      if (av?.inquiry_id) inquiry = await svc.entities.Inquiry.get(av.inquiry_id).catch(() => null);
    } else if (body.inquiry_id) {
      inquiry = await svc.entities.Inquiry.get(body.inquiry_id).catch(() => null);
      if (!inquiry) return Response.json({ error: 'Inquiry not found' }, { status: 404 });
      const avs = await svc.entities.AnswerVersion.filter({ inquiry_id: body.inquiry_id }, 'version', 50);
      av = avs[avs.length - 1] || null;
      if (av?.warrant_id) warrant = await svc.entities.Warrant.get(av.warrant_id).catch(() => null);
    } else {
      return Response.json({ error: 'warrant_id or inquiry_id is required' }, { status: 400 });
    }

    const avId = av?.id || null;
    const inqId = inquiry?.id || av?.inquiry_id || null;
    const truthDecision = av?.cognitive_state?.truth_decision || modelAssessedDecision({
      policyId: 'evidence-pack-model-assessment',
      policyVersion: '1',
      missingEvidence: ['The answer version has no independently evaluated factual decision.'],
    });

    const debates = inqId ? await svc.entities.Debate.filter({ inquiry_id: inqId }, '-created_date', 20) : [];
    const reviews = avId ? await svc.entities.Review.filter({ answer_version_id: avId }, '-created_date', 20) : [];
    const audit = avId ? await svc.entities.AuditLog.filter({ entity_id: avId }, '-created_date', 100) : [];
    const telemetry = avId ? await svc.entities.Telemetry.filter({ linked_entity_id: avId }, '-created_date', 100) : [];

    let signature_valid = false;
    const stored = warrant?.signed_hash || '';
    const scheme = signatureScheme(stored);
    if (warrant && av && stored) {
      const signatureKeys = { ed25519PublicKey: secrets.get('ED25519_PUBLIC_KEY'), hmacKey: secrets.get('sf2x_attestation_key') };
      for (const candidate of signingVariants(warrant, av)) {
        if (await verifySignature(candidate, stored, signatureKeys)) { signature_valid = true; break; }
      }
    }

    const pack = {
      schema: 'sf2x_evidence_pack/v1',
      generated_at: new Date().toISOString(),
      generated_by: guard.user.id,
      subject: { warrant_id: warrant?.id || null, answer_version_id: avId, inquiry_id: inqId },
      inquiry: inquiry ? {
        id: inquiry.id, prompt: inquiry.prompt, domain: inquiry.domain, stakes_level: inquiry.stakes_level,
        status: inquiry.status, created_date: inquiry.created_date,
      } : null,
      answer_version: av ? {
        id: av.id, version: av.version, answer_text: av.answer_text, trust_score: av.trust_score,
        metrics: av.metrics, stakes_level: av.stakes_level, created_date: av.created_date,
        ...exposeTruthDecision(truthDecision),
      } : null,
      warrant: warrant ? {
        id: warrant.id, validity_status: warrant.validity_status, confidence_score: warrant.confidence_score,
        premises: warrant.premises, conclusion: warrant.conclusion, sources: warrant.sources,
        source_snapshots: warrant.source_snapshots || [], signed_hash: warrant.signed_hash,
        expiry_date: warrant.expiry_date, created_date: warrant.created_date,
      } : null,
      signature: { valid: signature_valid, scheme, stored: warrant?.signed_hash || null, public_key: scheme === 'Ed25519' ? secrets.get('ED25519_PUBLIC_KEY') : null },
      debates: debates.map((d) => ({
        id: d.id, consensus: d.consensus, verdict_confidence: d.verdict_confidence,
        minority_report: d.minority_report, created_date: d.created_date,
      })),
      reviews: reviews.map((r) => ({
        id: r.id, capability_level: r.capability_level, status: r.status, decision: r.decision,
        reviewer_id: r.reviewer_id, decided_date: r.decided_date, created_date: r.created_date,
      })),
      audit_log: audit.map((a) => ({
        id: a.id, event_type: a.event_type, summary: a.summary, actor_id: a.actor_id,
        metadata: a.metadata, created_date: a.created_date,
      })),
      telemetry_span_count: telemetry.length,
      evidence_snapshots: warrant?.source_snapshots || [],
    };

    return Response.json({ pack, ...exposeTruthDecision(truthDecision) });
  } catch (error) {
    console.error('generateEvidencePack error', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
