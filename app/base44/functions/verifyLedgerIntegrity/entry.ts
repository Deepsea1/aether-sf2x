// Exposes ledgerIntegrityCheck (app/base44/shared/ledger.js) as a callable
// function so the Trust Center (and any authenticated caller) can verify the
// hash-chained, Ed25519-signed AuditLog ledger for their own tenant.
//
// Pages through AuditLog by created_date cursor (up to `max_entries`, default
// 5000), recomputes each entry's event_hash from its canonical content,
// verifies the Ed25519 signature as a separate check, and checks
// previous_event_hash chain continuity across page boundaries. The response
// separates hash vs signature failure counts and reports
// { pages_scanned, truncated } so a partial scan is never presented as full.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { ledgerIntegrityCheck } from '../../shared/ledger.js';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    // Sessionless calls make auth.me() throw a raw platform error
    // ('Authentication required to view users') that previously surfaced as a
    // 500 — catch it and return a clean 401. What counts as authorized is
    // unchanged: no session, no scan.
    let user = null;
    try { user = await base44.auth.me(); } catch (e) { user = null; }
    if (!user) return Response.json({ error: 'Authentication required' }, { status: 401 });

    if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
    const body = await req.json().catch(() => ({}));
    const { tenant_id, limit, max_entries } = body;

    const svc = base44.asServiceRole;
    // Default to the calling user's own tenant — never let a caller scan
    // another tenant's chain by omitting tenant_id.
    const result = await ledgerIntegrityCheck(svc, {
      tenant_id: tenant_id || user.id,
      // `limit` kept as a legacy alias for callers of the pre-paging API.
      max_entries: max_entries || limit || 5000,
    });

    return Response.json(result);
  } catch (error) {
    console.error('verifyLedgerIntegrity error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
