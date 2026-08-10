import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';
import Stripe from 'npm:stripe@17.7.0';

export default async function(req) {
  try {
    const sig = req.headers.get('stripe-signature') || '';
    const rawBody = await req.text();
    const stripe = new Stripe(secrets.get('STRIPE_SECRET_KEY'));
    const event = await stripe.webhooks.constructEventAsync(
      rawBody,
      sig,
      secrets.get('STRIPE_WEBHOOK_SECRET')
    );

    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;

    if (event.type === 'checkout.session.completed') {
      const s = event.data.object;
      const subId = s.subscription || '';
      // Idempotency: Stripe may replay this event — never create a duplicate Subscription for the same stripe_subscription_id.
      const existing = subId ? await svc.entities.Subscription.filter({ stripe_subscription_id: subId }) : [];
      if (!existing.length) {
        const userId = s.metadata?.user_id || '';
        await svc.entities.Subscription.create({
          user_id: userId,
          email: s.customer_email || s.customer_details?.email || '',
          stripe_customer_id: s.customer,
          stripe_subscription_id: subId,
          plan: s.metadata?.plan || 'pro',
          status: 'active',
          current_period_end: new Date().toISOString(),
        });
        await svc.entities.AuditLog.create({
          event_type: 'gate_decision',
          entity_type: 'Subscription',
          entity_id: subId,
          summary: `New subscription ${s.metadata?.plan || 'pro'} for ${s.customer_email || ''}`,
          metadata: { plan: s.metadata?.plan, stripe_customer_id: s.customer },
        }).catch(() => {});
      }
    }

    // Payment failure → mark the subscription past_due (starts the dunning workflow).
    if (event.type === 'invoice.payment_failed') {
      const inv = event.data.object;
      const subs = await svc.entities.Subscription.filter({ stripe_subscription_id: inv.subscription || '' });
      if (subs.length) {
        await svc.entities.Subscription.update(subs[0].id, { status: 'past_due' });
        await svc.entities.AuditLog.create({
          event_type: 'drift_alert', entity_type: 'Subscription', entity_id: subs[0].id,
          summary: 'Payment failed — subscription marked past_due',
          metadata: { stripe_subscription_id: inv.subscription, invoice: inv.id },
        }).catch(() => {});
      }
    }

    // Sync our status with Stripe (catches recovery and past_due transitions).
    if (event.type === 'customer.subscription.updated') {
      const s = event.data.object;
      const subs = await svc.entities.Subscription.filter({ stripe_subscription_id: s.id });
      if (subs.length) {
        const map = { active: 'active', trialing: 'trialing', past_due: 'past_due', unpaid: 'past_due', canceled: 'canceled', incomplete: 'canceled' };
        const next = map[s.status];
        const periodEnd = s.current_period_end ? new Date(s.current_period_end * 1000).toISOString() : null;
        const patch = {};
        if (next && subs[0].status !== next) patch.status = next;
        if (periodEnd) patch.current_period_end = periodEnd;
        if (Object.keys(patch).length) await svc.entities.Subscription.update(subs[0].id, patch);
      }
    }

    return Response.json({ received: true });
  } catch (error) {
    console.error('stripeWebhook error', error);
    return Response.json({ error: error.message }, { status: 400 });
  }
}