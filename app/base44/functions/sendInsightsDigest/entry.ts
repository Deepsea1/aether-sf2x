import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { requireAdmin } from '../../shared/auth.js';

// Step 2 of the Subscriber Drip Campaign workflow (3 days after signup): use the
// VerificationHistory assistant's summarization approach to build a "recent
// platform insights" digest from the latest VerificationHistory records and email
// it to the subscriber. Mirrors the verification_history_assistant instructions,
// but over platform-wide recent data (asServiceRole) rather than one user's own.

const VERDICTS = ['verified', 'contested', 'rejected'];

function tally(records) {
  const n = records.length;
  const avg = n ? Math.round(records.reduce((s, r) => s + (Number(r.trust_score) || 0), 0) / n) : null;
  const byVerdict = {};
  for (const v of VERDICTS) byVerdict[v] = records.filter((r) => r.verdict === v).length;
  const cats = {};
  const srcs = {};
  for (const r of records) {
    if (r.category) cats[r.category] = (cats[r.category] || 0) + 1;
    if (r.source) srcs[r.source] = (srcs[r.source] || 0) + 1;
  }
  return { n, avg, byVerdict, cats, srcs };
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const _auth = await requireAdmin(base44);
    if (!_auth.ok) return _auth.response;
    const svc = base44.asServiceRole;

    const body = await req.json().catch(() => ({}));
    const email = String(body.email || '').trim();
    if (!email) return Response.json({ error: 'email is required' }, { status: 400 });

    const records = await svc.entities.VerificationHistory.list('-created_date', 80).catch(() => []);
    const stats = tally(records || []);

    const dataJson = JSON.stringify({
      total: stats.n,
      average_trust_score: stats.avg,
      verdict_breakdown: stats.byVerdict,
      category_breakdown: stats.cats,
      source_breakdown: stats.srcs,
      recent_samples: (records || []).slice(0, 15).map((r) => ({
        trust_score: r.trust_score, verdict: r.verdict, category: r.category, source: r.source,
        preview: (r.text_preview || '').slice(0, 120),
      })),
    });

    const prompt =
      `You are the Aether VerificationHistory assistant. Write a concise, plain-language ` +
      `"Recent Platform Insights" digest for a newsletter subscriber, based on the latest ` +
      `verification activity across the Aether platform.\n\n` +
      `Include:\n` +
      `- Total recent verifications and the average trust score (0-100).\n` +
      `- Breakdown by verdict: verified vs contested vs rejected (counts and %).\n` +
      `- Breakdown by category (HR, Legal, Medicine, Engineering, General) if there's variety.\n` +
      `- Breakdown by source (api, widget, extension, playground, batch) if relevant.\n` +
      `- 2-3 notable patterns: low-trust clusters, or domains where AI outputs are less trustworthy.\n` +
      `- One short takeaway for someone deciding how much to trust AI outputs.\n\n` +
      `Keep it friendly, under ~220 words, and don't list individual records. ` +
      `If there is little or no activity, say the platform is early and share what Aether does.\n\n` +
      `Latest platform verification data (JSON):\n${dataJson}`;

    let digest;
    try {
      const res = await svc.integrations.Core.InvokeLLM({ prompt, model: 'automatic' });
      digest = typeof res === 'string' ? res : (res && (res.text || res.content)) || JSON.stringify(res);
    } catch (e) {
      console.error('sendInsightsDigest: InvokeLLM failed', e);
      digest = `Aether is still warming up — here's a quick look at recent activity across the platform.\n\nTotal recent verifications: ${stats.n}. Average trust score: ${stats.avg ?? 'n/a'} / 100.\n\nAether verifies AI-generated answers for hallucinations, signs every verdict with a cryptographic warrant, and tracks each claim's lineage. We'll share richer insights as platform activity grows.`;
    }

    const subject = 'Aether — your recent platform insights digest';
    const body_text = `Here's a snapshot of recent verification activity across the Aether platform.\n\n${digest}\n\n— The Aether team`;

    try {
      await svc.integrations.Core.SendEmail({ to: email, subject, body: body_text });
    } catch (e) {
      console.error('sendInsightsDigest: SendEmail failed for', email, e);
      return Response.json({ sent: false, reason: 'email_unavailable', error: String((e && e.message) || e), records_used: stats.n });
    }

    await svc.entities.AuditLog.create({
      event_type: 'review_opened', entity_type: 'NewsletterSubscriber', entity_id: null, actor_id: _auth.user?.id,
      summary: `Subscriber drip — insights digest sent to ${email} (${stats.n} records)`,
      metadata: { email, step: 'insights_digest', records_used: stats.n, automated: true },
    }).catch(() => {});

    return Response.json({ sent: true, email, records_used: stats.n });
  } catch (error) {
    console.error('sendInsightsDigest error', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}