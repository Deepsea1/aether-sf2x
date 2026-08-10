import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { requireAdmin } from '../../shared/auth.js';

// Step 1 of the Subscriber Drip Campaign workflow: immediate welcome email
// to a new NewsletterSubscriber. Triggered on NewsletterSubscriber create.

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const _auth = await requireAdmin(base44);
    if (!_auth.ok) return _auth.response;
    const svc = base44.asServiceRole;

    const body = await req.json().catch(() => ({}));
    const email = String(body.email || '').trim();
    if (!email) return Response.json({ error: 'email is required' }, { status: 400 });

    const subject = 'Welcome to Aether — the truth layer for AI';
    const body_text =
      `Welcome to Aether!\n\n` +
      `Aether verifies AI-generated answers for hallucinations, signs every verdict with a cryptographic warrant, and tracks the lineage of each claim — so you can tell which AI outputs to trust.\n\n` +
      `You're now subscribed to the Weekly AI Hallucination Report. Over the next few days we'll send a short digest of recent platform insights, and if Aether fits your workflow, an offer to get started.\n\n` +
      `Explore the live model leaderboard: https://aether.app/leaderboard\n\n` +
      `— The Aether team`;

    try {
      await svc.integrations.Core.SendEmail({ to: email, subject, body: body_text });
    } catch (e) {
      console.error('sendSubscriberWelcome: SendEmail failed for', email, e);
      return Response.json({ sent: false, reason: 'email_unavailable', error: String((e && e.message) || e) });
    }

    await svc.entities.AuditLog.create({
      event_type: 'review_opened', entity_type: 'NewsletterSubscriber', entity_id: null, actor_id: _auth.user?.id,
      summary: `Subscriber drip — welcome email sent to ${email}`,
      metadata: { email, step: 'welcome', automated: true },
    }).catch(() => {});

    return Response.json({ sent: true, email });
  } catch (error) {
    console.error('sendSubscriberWelcome error', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}