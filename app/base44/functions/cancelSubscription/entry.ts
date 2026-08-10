import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';
import Stripe from 'npm:stripe@17.7.0';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const svc = base44.asServiceRole;
    const subs = await svc.entities.Subscription.filter({ user_id: user.id, status: 'active' });
    if (!subs.length) return Response.json({ error: 'No active subscription' }, { status: 404 });
    const sub = subs[0];

    const stripe = new Stripe(secrets.get('STRIPE_SECRET_KEY'));
    if (sub.stripe_subscription_id) {
      await stripe.subscriptions.cancel(sub.stripe_subscription_id);
    }
    await svc.entities.Subscription.update(sub.id, { status: 'canceled' });
    await svc.entities.AuditLog.create({
      event_type: 'kill_switch',
      entity_type: 'Subscription',
      entity_id: sub.id,
      summary: `Subscription canceled by ${user.email || user.id}`,
      metadata: { plan: sub.plan },
    }).catch(() => {});

    return Response.json({ canceled: true });
  } catch (error) {
    console.error('cancelSubscription error', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}