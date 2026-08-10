import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';
import { requireAdmin } from '../../shared/auth.js';
import Stripe from 'npm:stripe@17.7.0';

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
    // After the 3-day wait, only act if still unpaid.
    if (sub.status === 'active' || sub.status === 'trialing') {
      await svc.entities.AuditLog.create({
        event_type: 'gate_decision', entity_type: 'Subscription', entity_id: sub.id,
        summary: 'Dunning skipped — subscription recovered', metadata: { status: sub.status },
      }).catch(() => {});
      return Response.json({ recovered: true, status: sub.status });
    }

    // Cancel in Stripe.
    const stripe = new Stripe(secrets.get('STRIPE_SECRET_KEY'));
    if (sub.stripe_subscription_id) {
      try { await stripe.subscriptions.cancel(sub.stripe_subscription_id); }
      catch (e) { console.error('stripe cancel error', e); }
    }
    await svc.entities.Subscription.update(sub.id, { status: 'canceled' });

    // Revoke the user's API key access.
    const keys = await svc.entities.ApiKey.filter({ user_id: sub.user_id, active: true });
    if (keys.length) {
      await svc.entities.ApiKey.updateMany({ user_id: sub.user_id, active: true }, { $set: { active: false } });
    }

    await svc.entities.AuditLog.create({
      event_type: 'kill_switch', entity_type: 'Subscription', entity_id: sub.id,
      summary: `Unpaid subscription canceled after 3-day grace; ${keys.length} API key(s) revoked`,
      metadata: { plan: sub.plan, revoked_keys: keys.length },
    }).catch(() => {});

    return Response.json({ canceled: true, revoked_keys: keys.length });
  } catch (error) {
    console.error('cancelUnpaidSubscription error', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}