import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { requireAdmin } from '../../shared/auth.js';

// Step 3 of the Subscriber Drip Campaign workflow (7 days after signup): if the
// subscriber hasn't started a subscription, send a discount offer. Skips silently
// if an active/trialing Subscription exists for their account.

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const _auth = await requireAdmin(base44);
    if (!_auth.ok) return _auth.response;
    const svc = base44.asServiceRole;

    const body = await req.json().catch(() => ({}));
    const email = String(body.email || '').trim();
    const subscriberId = String(body.subscriber_id || '').trim();
    if (!email) return Response.json({ error: 'email is required' }, { status: 400 });

    // Has the subscriber already started a subscription? Match by email → user.
    const users = await svc.entities.User.list('-created_date', 500).catch(() => []);
    const user = (users || []).find((u) => (u.email || '').toLowerCase() === email.toLowerCase());
    if (user) {
      const subs = await svc.entities.Subscription.filter({ user_id: user.id }).catch(() => []);
      const active = (subs || []).find((s) => s.status === 'active' || s.status === 'trialing');
      if (active) {
        await svc.entities.AuditLog.create({
          event_type: 'review_opened', entity_type: 'NewsletterSubscriber', entity_id: subscriberId || null, actor_id: _auth.user?.id,
          summary: `Subscriber drip — discount offer skipped for ${email} (already subscribed, plan=${active.plan || '?'})`,
          metadata: { email, step: 'discount_offer', action: 'skipped', reason: 'already_subscribed', plan: active.plan, automated: true },
        }).catch(() => {});
        return Response.json({ offered: false, reason: 'already_subscribed', email });
      }
    }

    const subject = 'Aether — 20% off your first month of Pro';
    const body_text =
      `It's been a week since you joined the Aether list, and we'd love for you to try the full platform.\n\n` +
      `Aether Pro gives you:\n` +
      `- Unlimited AI-answer verification with signed warrants\n` +
      `- The Red-Team Arena and multi-model Tribunal\n` +
      `- API access with usage-based credits\n` +
      `- Governance dashboards and audit lineage\n\n` +
      `Use code WELCOME20 at checkout for 20% off your first month of Pro.\n` +
      `Start here: https://aether.app/pricing\n\n` +
      `— The Aether team`;

    try {
      await svc.integrations.Core.SendEmail({ to: email, subject, body: body_text });
    } catch (e) {
      console.error('sendDiscountOffer: SendEmail failed for', email, e);
      return Response.json({ offered: false, reason: 'email_unavailable', error: String((e && e.message) || e) });
    }

    await svc.entities.AuditLog.create({
      event_type: 'review_opened', entity_type: 'NewsletterSubscriber', entity_id: subscriberId || null, actor_id: _auth.user?.id,
      summary: `Subscriber drip — discount offer sent to ${email}`,
      metadata: { email, step: 'discount_offer', action: 'sent', code: 'WELCOME20', automated: true },
    }).catch(() => {});

    return Response.json({ offered: true, email });
  } catch (error) {
    console.error('sendDiscountOffer error', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}