import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { requireAdmin } from '../../shared/auth.js';
import { refreshUserMetrics } from '../../shared/userMetrics.js';

// Recomputes the UserMetrics rollup for one user (body.user_id) or every app
// user (default), aggregating their UserEvent log + ApiUsage. Admin-only; runs
// on the daily User Metrics Refresh workflow but can be invoked on demand.

const MAX_USERS = 500;

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const _auth = await requireAdmin(base44);
    if (!_auth.ok) return _auth.response;
    const svc = base44.asServiceRole;

    const body = await req.json().catch(() => ({}));
    if (body.user_id) {
      const metrics = await refreshUserMetrics(svc, String(body.user_id));
      return Response.json({ refreshed: 1, metrics });
    }

    const users = await svc.entities.User.list('-created_date', MAX_USERS).catch(() => []);
    const seen = new Set();
    const results = [];
    for (const u of users) {
      const uid = String(u.id);
      if (seen.has(uid)) continue;
      seen.add(uid);
      try {
        const m = await refreshUserMetrics(svc, uid);
        results.push({ user_id: uid, email: u.email, total_inquiries: m.total_inquiries, mean_trust: m.mean_trust, api_credits_used: m.api_credits_used });
      } catch (e) {
        results.push({ user_id: uid, error: String((e && e.message) || e).slice(0, 160) });
      }
    }
    return Response.json({ refreshed: results.length, results });
  } catch (error) {
    console.error('refreshUserMetrics error', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}