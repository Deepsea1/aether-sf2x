import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { computeTrustworthyRate } from '../../shared/sf2xCore.js';

// Public Trust Scorecard API — free, keyless endpoint that returns the trust
// scorecard for any attested answer (by lineage id). Spreads the SF2X standard:
// anyone can read a scorecard, so businesses can publish verifiable trust.

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;
    const body = await req.json().catch(() => ({}));
    const id = String(body.answer_version_id || body.lineage_id || '').trim();
    if (!id) return Response.json({ error: 'answer_version_id is required' }, { status: 400 });

    let av;
    try { av = await svc.entities.AnswerVersion.get(id); }
    catch { return Response.json({ error: 'Not found' }, { status: 404 }); }

    let warrant = null;
    if (av.warrant_id) warrant = await svc.entities.Warrant.get(av.warrant_id).catch(() => null);

    const corrections = await svc.entities.CorrectionEvent.filter({ to_version_id: id }).catch(() => []);
    const drift = corrections.length
      ? (corrections[0].drift_score ?? null)
      : (av.metrics && av.metrics.epistemic_drift_score != null ? av.metrics.epistemic_drift_score : null);

    const trust = av.trust_score != null ? av.trust_score : computeTrustworthyRate(av.metrics || {}, warrant || {});

    return Response.json({
      answer_version_id: av.id,
      inquiry_id: av.inquiry_id,
      trust_score: trust,
      warrant_status: warrant ? warrant.validity_status : 'unknown',
      warrant_confidence: warrant ? warrant.confidence_score : null,
      corrections_count: corrections.length,
      drift_score: drift,
      version: av.version,
      created_date: av.created_date,
      verify_url: `${new URL(req.url).origin}/verify/${av.id}`,
      retrieved_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('trustScorecard error', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}