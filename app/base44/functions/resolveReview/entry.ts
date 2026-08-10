import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { buildLedgerEntry } from '../../shared/ledger.js';
import { resolveReviewRow } from '../../shared/reviews.js';

// Resolve a gate review (§12.5) — the human approve/reject decision with a
// required rationale. Records decided_by/decided_at/rationale on the Review
// row and appends a hash-chained review_resolved ledger entry.
//
// Separation-of-duties floor: the decider is recorded (decided_by + the
// ledger's actor_id), which makes self-review auditable. BLOCKING self-review
// needs authorship data the wedge lacks — GitHub commit/PR authorship is not
// mapped to app users — so enforcement is an honest follow-up, not faked here.
//
// POST { review_id, decision: 'approved'|'rejected', rationale }
// 400 invalid input · 404 unknown review · 409 already decided.

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });

    const svc = base44.asServiceRole;
    const body = await req.json().catch(() => ({}));

    const outcome = await resolveReviewRow(svc, {
      review_id: (body.review_id || '').toString().trim(),
      decision: (body.decision || '').toString().trim(),
      rationale: (body.rationale || '').toString(),
      actor_id: user.id,
      writeLedger: (params) => createLedgerEntry(svc, params),
    });
    if (!outcome.ok) return Response.json({ error: outcome.error }, { status: outcome.status });

    return Response.json({
      resolved: true,
      review_id: outcome.review.id,
      status: outcome.review.status,
      decided_by: outcome.review.decided_by,
      decided_at: outcome.review.decided_at,
    });
  } catch (error) {
    console.error('resolveReview error', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

async function createLedgerEntry(svc, params) {
  try {
    const entry = await buildLedgerEntry(svc, params);
    await svc.entities.AuditLog.create(entry);
  } catch (e) {
    console.error('Ledger entry failed:', e?.message || e);
  }
}
