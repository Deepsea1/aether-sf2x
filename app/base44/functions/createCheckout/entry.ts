import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';
import Stripe from 'npm:stripe@17.7.0';

// Public checkout — this app does not require login, so we never gate checkout
// on base44.auth.me(). The client posts { plan, customer_email, billing? } and
// we resolve the Stripe price from a trusted server-side plan map (the client
// can never supply an arbitrary priceId). Free plans short-circuit with no
// session — the frontend routes them to signup instead of Stripe.
const PLAN_PRICES = {
  starter: { monthly: 'price_1U0E688i0QdzMkyzF6svt3HO' },   // $20/mo
  pro: { monthly: 'price_1U0E688i0QdzMkyzDIhUMNwP' },        // $100/mo
  enterprise: { monthly: 'price_1Tzat68i0QdzMkyzfXEhHOOb' }, // $1999/mo
  scale: { monthly: 'price_1Tzat68i0QdzMkyzDIBllsj9' },      // $9999/mo
  byok: { monthly: 'price_1U1kpX8i0QdzMkyzs4uHMCQC' },   // $999/mo — Enterprise BYOK (bring your own provider key)
  'api-access': { monthly: 'price_1Tz2vb8i0QdzMkyzD41IPgDL' },     // $49/mo — 10,000 credits
  'api-access-pro': { monthly: 'price_1Tz2vb8i0QdzMkyztOXNyqPy' }, // $199/mo — 50,000 credits
};
const FREE_PLANS = new Set(['free']);

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    // Auth is optional on a public app — used only to prefill the owner/user_id.
    let user = null;
    try { user = await base44.auth.me(); } catch {}

    const body = await req.json().catch(() => ({}));
    const plan = String(body.plan || '').toLowerCase();
    const billing = body.billing === 'yearly' ? 'yearly' : 'monthly';

    if (FREE_PLANS.has(plan)) return Response.json({ url: null, free: true });

    const priceId = PLAN_PRICES[plan]?.[billing];
    if (!priceId) return Response.json({ error: 'Invalid plan selection' }, { status: 400 });

    const customerEmail = String(body.customer_email || '').trim().toLowerCase() || (user?.email || '');
    if (!customerEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(customerEmail)) {
      return Response.json({ error: 'A valid email is required to start checkout.' }, { status: 400 });
    }

    const stripe = new Stripe(secrets.get('STRIPE_SECRET_KEY'));
    const origin = new URL(req.url).origin;
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/pricing?status=success`,
      cancel_url: `${origin}/pricing?status=cancel`,
      customer_email: customerEmail,
      metadata: {
        base44_app_id: secrets.get('BASE44_APP_ID'),
        user_id: user?.id || '',
        plan,
        billing,
      },
    });
    return Response.json({ url: session.url });
  } catch (error) {
    console.error('createCheckout error', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}