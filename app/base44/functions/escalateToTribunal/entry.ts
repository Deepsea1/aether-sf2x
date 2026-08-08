import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { buildDebatePrompt, DEBATE_JSON_SCHEMA } from '../../shared/sf2xDebate.js';
import { requireAdmin } from '../../shared/auth.js';
import { computeTrustworthyRate } from '../../shared/sf2xCore.js';
import { recordUserEvent } from '../../shared/userMetrics.js';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;
    const body = await req.json().catch(() => ({}));
    const _auth = await requireAdmin(base44);
    if (!_auth.ok) return _auth.response;
    const answerVersionId = (body.answer_version_id || '').toString().trim();
    if (!answerVersionId) return Response.json({ error: 'answer_version_id is required' }, { status: 400 });

    const av = await svc.entities.AnswerVersion.get(answerVersionId);
    const inquiry = await svc.entities.Inquiry.get(av.inquiry_id);
    let warrant = null;
    if (av.warrant_id) warrant = await svc.entities.Warrant.get(av.warrant_id).catch(() => null);
    const trust = Math.round(computeTrustworthyRate(av.metrics, warrant));

    const systems = await svc.entities.AISystem.list('-created_date', 10);
    const agents = [
      systems[0] || { id: 'gen-proposer', name: 'Proposer Agent' },
      systems[1] || { id: 'gen-critic', name: 'Critic Agent' },
      systems[2] || { id: 'gen-verifier', name: 'Verifier Agent' },
    ];

    const res = await svc.integrations.Core.InvokeLLM({
      prompt: buildDebatePrompt(inquiry.prompt, av.answer_text, warrant, inquiry.domain, inquiry.stakes_level),
      response_json_schema: DEBATE_JSON_SCHEMA,
    });
    const r = res && res.data ? res.data : res;
    const consensus = r.consensus || 'contested';
    const corrections = (r.verifier?.corrections || []).join(' · ');

    const debate = await svc.entities.Debate.create({
      inquiry_id: inquiry.id,
      answer_version_id: av.id,
      proposer: { ...(r.proposer || {}), agent_name: agents[0].name, agent_id: agents[0].id },
      critic: { ...(r.critic || {}), agent_name: agents[1].name, agent_id: agents[1].id },
      verifier: { ...(r.verifier || {}), agent_name: agents[2].name, agent_id: agents[2].id },
      consensus,
      verdict_confidence: r.verifier?.confidence ?? 0,
      minority_report: r.minority_report || '',
    });

    const recommended =
      consensus === 'rejected' ? 'KILL-SWITCH — tribunal rejected the answer as unwarranted'
      : consensus === 'contested' ? 'VERIFY / RE-RUN — apply tribunal corrections and re-evaluate'
      : 'APPROVE — tribunal agreed the answer is warranted';

    const summary = `Tribunal consensus: ${consensus} (verifier confidence ${Math.round((r.verifier?.confidence || 0) * 100)}%). Trust score: ${trust}/100. Verifier: ${r.verifier?.verdict || '—'}. Corrections: ${corrections || 'none'}. Recommended action: ${recommended}.`;

    await svc.entities.Inquiry.update(inquiry.id, { validated_answer: summary, status: 'review' });

    const existingReviews = await svc.entities.Review.filter({ answer_version_id: av.id }).catch(() => []);
    const prior = existingReviews.find((r) => r.status === 'pending') || existingReviews[0];
    let review;
    if (prior) {
      review = await svc.entities.Review.update(prior.id, {
        capability_level: 'L4',
        status: prior.status === 'approved' || prior.status === 'killed' ? prior.status : 'pending',
        decision: recommended,
        notes: summary,
      });
    } else {
      review = await svc.entities.Review.create({
        answer_version_id: av.id,
        inquiry_id: inquiry.id,
        capability_level: 'L4',
        status: 'pending',
        decision: recommended,
        notes: summary,
      });
    }

    await svc.entities.AuditLog.create({
      event_type: 'gate_decision', entity_type: 'AnswerVersion', entity_id: av.id,
      summary: `Auto-tribunal escalation: ${consensus} · trust ${trust} → review queue (${recommended})`,
      metadata: { debate_id: debate.id, review_id: review.id, consensus, trust, stakes: inquiry.stakes_level },
    }).catch(() => {});

    const users = await svc.entities.User.list().catch(() => []);
    const admins = users.filter((u) => u.role === 'admin' && u.email);
    const subject = `🛡️ SF2X tribunal escalation — ${consensus} · trust ${trust}/100`;
    const emailBody = `A warranted answer was escalated to the review queue by the tribunal.

Inquiry: "${inquiry.prompt}"
Domain: ${inquiry.domain} · Stakes: ${inquiry.stakes_level}
Trust score: ${trust}/100

TRIBUNAL VERDICT
Consensus: ${consensus}
Verifier confidence: ${Math.round((r.verifier?.confidence || 0) * 100)}%
Verifier: ${r.verifier?.verdict || '—'}
Corrections: ${corrections || 'none'}
Minority report: ${r.minority_report || 'none'}

RECOMMENDED ACTION: ${recommended}

Open the Governance console → review queue to APPROVE, RE-RUN, VERIFY, or KILL-SWITCH this answer.
Inquiry ID: ${inquiry.id}

— SF2X automated tribunal escalation`;
    let notified = 0;
    for (const admin of admins) {
      try { await svc.integrations.Core.SendEmail({ to: admin.email, subject, body: emailBody }); notified++; }
      catch (e) { console.error('escalateToTribunal email failed', admin.email, e); }
    }

    await recordUserEvent(svc, {
      user_id: _auth.user?.id, event_type: 'review',
      trust_score: trust, verdict: consensus,
      domain: inquiry.domain, stakes: inquiry.stakes_level, source: 'workflow',
      linked_entity_type: 'Review', linked_entity_id: review?.id,
      metadata: { debate_id: debate.id, recommended, answer_version_id: av.id },
    });
    return Response.json({ escalated: true, consensus, trust, debate_id: debate.id, review_id: review.id, notified });
  } catch (error) {
    console.error('escalateToTribunal error', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}