import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';
import Stripe from 'npm:stripe@17.7.0';

const PRICES = {
  starter: {
    monthly: 'price_1TwgtTIM3eEU2REesKokPiz5',
    yearly: 'price_1TwgtUIM3eEU2REeFENEjAv6',
  },
  pro: {
    monthly: 'price_1TwgtUIM3eEU2REeLog5X9Bv',
    yearly: 'price_1TwgtUIM3eEU2REeduc87D1M',
  },
};

export default async function (req) {
  try {
    if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
    const base44 = createClientFromRequest(req);
    const caller = await base44.auth.me();
    if (!caller || caller.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const userId = (body.user_id || '').toString();
    const plan = body.plan === 'starter' ? 'starter' : 'pro';
    const billing = body.billing === 'yearly' ? 'yearly' : 'monthly';
    const priceId = PRICES[plan][billing];
    if (!userId) return Response.json({ error: 'user_id required' }, { status: 400 });

    const svc = base44.asServiceRole;
    const user = await svc.entities.User.get(userId);
    if (!user || !user.email) {
      return Response.json({ error: 'User not found or has no email address' }, { status: 404 });
    }

    // Cooldown: don't spam a user with upgrade links — at most one per 24h (covers users with no subscription too).
    const COOLDOWN_MS = 24 * 60 * 60 * 1000;
    const since = new Date(Date.now() - COOLDOWN_MS).toISOString();
    const recentLogs = await svc.entities.AuditLog.filter({ entity_type: 'User', entity_id: user.id, created_date: { $gte: since } });
    const alreadySent = (recentLogs || []).some((a) => a.summary && a.summary.startsWith('Upgrade checkout link emailed'));
    if (alreadySent) {
      return Response.json({ status: 'cooldown', email: user.email, message: 'An upgrade link was already sent in the last 24h — cooldown active.' }, { status: 409 });
    }

    const stripe = new Stripe(secrets.get('STRIPE_SECRET_KEY'));
    const origin = new URL(req.url).origin;
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/pricing?status=success`,
      cancel_url: `${origin}/pricing?status=cancel`,
      customer_email: user.email,
      metadata: {
        base44_app_id: secrets.get('BASE44_APP_ID'),
        user_id: user.id,
        plan,
        billing,
      },
    });

    const planName = plan === 'pro' ? 'Prime (Pro)' : 'Forge (Starter)';
    await svc.integrations.Core.SendEmail({
      to: user.email,
      subject: `Upgrade your SF2X account — ${planName}`,
      body: [
        `Hi ${user.full_name || 'there'},`,
        '',
        `Unlock the full SF2X Epistemic Operating System with a ${planName} plan (billed ${billing}).`,
        '',
        'Complete your upgrade here:',
        session.url,
        '',
        'Every answer stays warranted, lineage-tracked, and epistemically scored. This checkout link is unique to your account — if you didn\u2019t expect this email, you can safely ignore it.',
        '',
        '— The SF2X Team',
      ].join('\n'),
    });

    await svc.entities.AuditLog.create({
      event_type: 'gate_decision',
      entity_type: 'User',
      entity_id: user.id,
      actor_id: caller.id,
      summary: `Upgrade checkout link emailed to ${user.email} (${plan}/${billing})`,
      metadata: { plan, billing, target_email: user.email },
    }).catch(() => {});

    return Response.json({ status: 'ok', email: user.email, checkout_url: session.url, plan, billing });
  } catch (error) {
    console.error('sendUpgradeEmail error', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}