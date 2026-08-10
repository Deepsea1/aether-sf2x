import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';
import { requireAdmin } from '../../shared/auth.js';
import { buildThinkPrompt, THINK_JSON_SCHEMA, generateSignature, computeTrustworthyRate } from '../../shared/sf2xCore.js';
import { buildDebatePrompt, DEBATE_JSON_SCHEMA } from '../../shared/sf2xDebate.js';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;
    const body = await req.json().catch(() => ({}));
    const _auth = await requireAdmin(base44);
    if (!_auth.ok) return _auth.response;
    const correctionId = body.correction_event_id;
    if (!correctionId) return Response.json({ error: 'correction_event_id is required' }, { status: 400 });

    // 1. Load the correction event and the inquiry it corrects.
    const correction = await svc.entities.CorrectionEvent.get(correctionId);
    const inquiry = await svc.entities.Inquiry.get(correction.inquiry_id);

    // 2. Load the corrected-to answer version + its warrant (the thing under scrutiny).
    const versions = await svc.entities.AnswerVersion.filter({ inquiry_id: inquiry.id }, 'version', 50);
    const target = versions.find((v) => v.id === correction.to_version_id) || versions[versions.length - 1];
    let warrant = null;
    if (target?.warrant_id) warrant = await svc.entities.Warrant.get(target.warrant_id).catch(() => null);

    // 3. Assign three governed AISystems to the tribunal roles.
    const systems = await svc.entities.AISystem.list('-created_date', 10);
    const agents = [
      systems[0] || { id: 'gen-proposer', name: 'Proposer Agent' },
      systems[1] || { id: 'gen-critic', name: 'Critic Agent' },
      systems[2] || { id: 'gen-verifier', name: 'Verifier Agent' },
    ];

    // 4. Convene the debate.
    const res = await svc.integrations.Core.InvokeLLM({
      prompt: buildDebatePrompt(inquiry.prompt, target?.answer_text, warrant, inquiry.domain, inquiry.stakes_level),
      response_json_schema: DEBATE_JSON_SCHEMA,
    });
    const r = res && res.data ? res.data : res;

    const debate = await svc.entities.Debate.create({
      inquiry_id: inquiry.id,
      answer_version_id: target?.id,
      proposer: { ...(r.proposer || {}), agent_name: agents[0].name, agent_id: agents[0].id },
      critic: { ...(r.critic || {}), agent_name: agents[1].name, agent_id: agents[1].id },
      verifier: { ...(r.verifier || {}), agent_name: agents[2].name, agent_id: agents[2].id },
      consensus: r.consensus || 'contested',
      verdict_confidence: r.verifier?.confidence ?? 0,
      minority_report: r.minority_report || '',
    });
    await svc.entities.AuditLog.create({
      event_type: 'gate_decision', entity_type: 'Debate', entity_id: debate.id,
      summary: `Auto-tribunal on correction: ${r.consensus} (conf ${Math.round((r.verifier?.confidence || 0) * 100)}%)`,
      metadata: { consensus: r.consensus, correction_id: correction.id },
    }).catch(() => {});

    // 5. If the tribunal rejects the corrected answer, escalate to human review and stop.
    if (r.consensus === 'rejected') {
      await svc.entities.Inquiry.update(inquiry.id, { status: 'review' });
      await svc.entities.AuditLog.create({
        event_type: 'gate_decision', entity_type: 'Inquiry', entity_id: inquiry.id,
        summary: 'Inquiry routed to review: tribunal rejected corrected answer',
        metadata: { debate_id: debate.id, correction_id: correction.id },
      }).catch(() => {});
      return Response.json({ status: 'rejected', debate_id: debate.id, inquiry_id: inquiry.id });
    }

    // 6. Produce the final validated answer version, applying the verifier's corrections.
    const corrections = (r.verifier?.corrections || []).join(' · ');
    const refinePrompt = `${buildThinkPrompt(inquiry.prompt, inquiry.domain, inquiry.stakes_level)}

TRIBUNAL VERDICT: ${r.consensus} (confidence ${r.verifier?.confidence ?? 0})
VERIFIER CORRECTIONS TO APPLY:
${corrections || 'none — the tribunal agreed the answer is warranted as-is'}

Produce the final validated answer, incorporating the tribunal's corrections. Preserve the warranted structure (answer, cognitive_state, warrant, metrics). This is the tribunal-validated revision.`;

    const refineRes = await svc.integrations.Core.InvokeLLM({ prompt: refinePrompt, response_json_schema: THINK_JSON_SCHEMA });
    const v = refineRes && refineRes.data ? refineRes.data : refineRes;

    const version = (target?.version || versions.length) + 1;
    const av = await svc.entities.AnswerVersion.create({
      inquiry_id: inquiry.id,
      version,
      answer_text: v.answer || '',
      cognitive_state: { ...(v.cognitive_state || {}), model: 'tribunal_validated', source: 'debate_workflow', debate_id: debate.id },
      metrics: v.metrics || {},
      trust_score: computeTrustworthyRate(v.metrics || {}, v.warrant || {}),
      stakes_level: inquiry.stakes_level,
    });

    const w = v.warrant || {};
    const expiryDays = w.expiry_days || 30;
    const signedHash = await generateSignature([av.id, w.conclusion || '', (w.premises || []).join(';;')].join('|'), secrets.get('sf2x_attestation_key') || secrets.get('SF2X_ATTESTATION_KEY'));
    const newWarrant = await svc.entities.Warrant.create({
      answer_version_id: av.id,
      premises: w.premises || [],
      conclusion: w.conclusion || '',
      confidence_score: w.confidence_score ?? 0,
      validity_status: w.validity_status || 'valid',
      sources: w.sources || [],
      expiry_date: new Date(Date.now() + expiryDays * 86400000).toISOString(),
      signed_hash: signedHash,
    });
    await svc.entities.AnswerVersion.update(av.id, { warrant_id: newWarrant.id });

    // 7. Update the original Inquiry with the final validated response.
    await svc.entities.Inquiry.update(inquiry.id, { status: 'answered' });
    await svc.entities.AuditLog.create({
      event_type: 'answer_promoted',
      entity_type: 'AnswerVersion',
      entity_id: av.id,
      summary: `Tribunal-validated answer v${version} promoted (${r.consensus}) · correction ${correction.from_version}→${correction.to_version}`,
      metadata: { debate_id: debate.id, correction_id: correction.id, consensus: r.consensus, validated_version: version },
    }).catch(() => {});

    return Response.json({
      status: 'validated',
      debate_id: debate.id,
      inquiry_id: inquiry.id,
      answer_version_id: av.id,
      version,
      consensus: r.consensus,
    });
  } catch (error) {
    console.error('debateAndValidateCorrection error', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}