import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { requireAdmin } from '../../shared/auth.js';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;

    const body = await req.json().catch(() => ({}));
    const _auth = await requireAdmin(base44);
    if (!_auth.ok) return _auth.response;
    const inquiryId = (body.inquiry_id || '').toString().trim();
    const benchScore = body.bench_score;
    const threshold = body.threshold;
    const outcome = body.attack_outcome || 'unknown';
    const severity = body.severity || 'unknown';
    if (!inquiryId) return Response.json({ error: 'inquiry_id is required' }, { status: 400 });

    // Notify the security team = all admin users (registered app users only receive email).
    const users = await svc.entities.User.list().catch(() => []);
    const admins = users.filter((u) => u.role === 'admin');
    if (!admins.length) {
      return Response.json({ notified: 0, reason: 'no admin users found to notify' });
    }

    const subject = `🛡️ SF2X security alert — bench score ${benchScore}/100 below threshold`;
    const body_text = `An automatically triggered red-team run on a high-risk inquiry pushed the deployment benchmark score below the security threshold.

Inquiry ID: ${inquiryId}
Red-team outcome: ${outcome}
Severity: ${severity}
Benchmark score: ${benchScore}/100
Threshold: ${threshold}/100

Recommended action: review the flagged inquiry and its warrant in the Governance console, and consider suppressing the answer if the red-team broke it.

— SF2X automated security workflow`;

    let notified = 0;
    for (const admin of admins) {
      if (!admin.email) continue;
      try {
        await svc.integrations.Core.SendEmail({ to: admin.email, subject, body: body_text });
        notified++;
      } catch (e) {
        console.error('notifySecurityTeam email failed for', admin.email, e);
      }
    }

    await svc.entities.AuditLog.create({
      event_type: 'gate_decision',
      entity_type: 'Inquiry',
      entity_id: inquiryId,
      summary: `Security team notified: bench ${benchScore} < ${threshold} (red-team ${outcome}/${severity}); ${notified} admin(s) emailed`,
      metadata: { bench_score: benchScore, threshold, outcome, severity, notified, automated: true },
    }).catch(() => {});

    return Response.json({ notified, recipients: admins.map((a) => a.email) });
  } catch (error) {
    console.error('notifySecurityTeam error', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}