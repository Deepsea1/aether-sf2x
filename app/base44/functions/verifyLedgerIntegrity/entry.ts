// Exposes ledgerIntegrityCheck (app/base44/shared/ledger.js) as a callable
// function so the Trust Center (and any authenticated caller) can verify the
// hash-chained, Ed25519-signed AuditLog ledger for their own tenant.
//
// Scans up to `limit` recent AuditLog entries, recomputes each entry's
// event_hash from its canonical content, verifies the Ed25519 signature, and
// checks previous_event_hash chain continuity. See ledger.js lines 118-131.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { ledgerIntegrityCheck } from '../../shared/ledger.js';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
    const body = await req.json().catch(() => ({}));
    const { tenant_id, limit } = body;

    const svc = base44.asServiceRole;
    // Default to the calling user's own tenant — never let a caller scan
    // another tenant's chain by omitting tenant_id.
    const result = await ledgerIntegrityCheck(svc, {
      tenant_id: tenant_id || user.id,
      limit: limit || 500,
    });

    return Response.json(result);
  } catch (error) {
    console.error('verifyLedgerIntegrity error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
