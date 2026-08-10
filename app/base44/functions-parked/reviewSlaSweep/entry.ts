import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { requireAdmin } from '../../shared/auth.js';
import { buildLedgerEntry } from '../../shared/ledger.js';
import { sweepOverdueReviews } from '../../shared/reviews.js';

// Gate-review SLA sweep (§12.4), invoked by a scheduled workflow or an admin.
//  - Open gate reviews past due_by with on_timeout 'advisory' → status
//    'expired_advisory' (the review lapses; the gate outcome was advisory).
//  - Past due_by with on_timeout 'remain_blocked' → stays open, escalated: true
//    once + an escalation ledger entry (the block holds until a human decides).
// Missing/unknown on_timeout fails closed to remain_blocked — a timeout never
// silently releases a gate. Idempotent: re-running repeats no transition.
// Every transition writes a hash-chained ledger entry.

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const _auth = await requireAdmin(base44);
    if (!_auth.ok) return _auth.response;
    const svc = base44.asServiceRole;
    const adminId = _auth.user?.id;

    const result = await sweepOverdueReviews(svc, {
      actor_id: adminId,
      writeLedger: (params) => createLedgerEntry(svc, params),
    });

    const report = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      checked: result.checked,
      overdue: result.overdue,
      expired_advisory: result.expired_advisory.length,
      escalated: result.escalated.length,
      expired_advisory_ids: result.expired_advisory,
      escalated_ids: result.escalated,
    };
    if (result.expired_advisory.length || result.escalated.length) {
      await createLedgerEntry(svc, {
        event_type: 'gate_decision', entity_type: 'Review', entity_id: null, actor_id: adminId,
        summary: `Review SLA sweep: ${result.expired_advisory.length} expired advisory, ${result.escalated.length} escalated (of ${result.overdue} overdue)`,
        metadata: { checked: result.checked, overdue: result.overdue, expired_advisory: result.expired_advisory, escalated: result.escalated, automated: true },
      });
    }
    return Response.json(report);
  } catch (error) {
    console.error('reviewSlaSweep error', error);
    return Response.json({ error: error.message }, { status: error.status || 500 });
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
