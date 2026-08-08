import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { requireAdmin } from '../../shared/auth.js';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;
    const body = await req.json().catch(() => ({}));
    const _auth = await requireAdmin(base44);
    if (!_auth.ok) return _auth.response;
    const subId = body.subscription_id;
    if (!subId) return Response.json({ error: 'subscription_id is required' }, { status: 400 });

    const sub = await svc.entities.Subscription.get(subId);
    let email = sub.email || '';
    if (!email) {
      const users = await svc.entities.User.filter({ id: sub.user_id });
      email = users[0]?.email || '';
    }
    if (!email) return Response.json({ error: 'No email on record for subscriber' }, { status: 404 });

    await svc.integrations.Core.SendEmail({
      to: email,
      subject: 'Action needed: your SF2X subscription payment failed',
      body: `Hi,

We were unable to process the most recent payment for your SF2X ${sub.plan || ''} subscription, so your account is now past due.

Please update your payment method within 3 days to avoid automatic cancellation and revocation of your API access.

— The SF2X team`,
    });
    await svc.entities.AuditLog.create({
      event_type: 'drift_alert', entity_type: 'Subscription', entity_id: sub.id,
      summary: 'Dunning email sent: payment failed', metadata: { email, plan: sub.plan },
    }).catch(() => {});

    return Response.json({ sent: true, email });
  } catch (error) {
    console.error('sendDunningEmail error', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}