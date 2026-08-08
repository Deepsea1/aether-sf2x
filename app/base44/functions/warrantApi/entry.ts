import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';
import { resolveApiKey, checkQuota, recordUsage, CREDIT_COSTS } from '../../shared/apiAuth.js';
import { attestAnswer } from '../../shared/attest.js';
import { runRedTeamAttack } from '../../shared/redTeam.js';
import { recordUserEvent } from '../../shared/userMetrics.js';

// Inbound Warrant API — businesses submit an AI-generated answer (with optional
// claimed premises/sources) and receive an independent attestation: atomic-claim
// decomposition, source-grounded verification, a calibrated trust score, a signed
// warrant, and a lineage id for later verification.

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;
    const body = await req.json().catch(() => ({}));
    const auth = await resolveApiKey(svc, req, { base44 });
    if (!auth.ok) return auth.response;
    const quota = await checkQuota(svc, auth.apiKey);
    if (!quota.allowed) return Response.json({ error: 'Monthly credit quota exceeded', plan: quota.plan, limit: quota.limit, used: quota.used, remaining: 0 }, { status: 429 });
    const result = await attestAnswer(svc, {
      answerText: body.answer_text,
      premises: body.premises,
      sources: body.sources,
      domain: body.domain,
      stakes: body.stakes,
      modelLabel: body.model_label,
      apiKey: auth.apiKey,
      origin: new URL(req.url).origin,
      signatureKeys: { ed25519PrivateKey: secrets.get('ED25519_PRIVATE_KEY'), hmacKey: secrets.get('sf2x_attestation_key') },
    });
    // Red-team stress test — run on every inbound attestation so the warrant is
    // certified, not just the tribunal path. broken/error => uncetrified.
    let warrant = null;
    if (result.warrant_id) warrant = await svc.entities.Warrant.get(result.warrant_id).catch(() => null);
    const redTeam = await runRedTeamAttack(svc, {
      inquiryId: result.inquiry_id, answerVersionId: result.lineage_id,
      prompt: String(body.answer_text || ''), answerText: String(body.answer_text || ''),
      warrant, domain: body.domain,
    });
    const certified = !!redTeam.run && redTeam.outcome !== 'error' && redTeam.outcome !== 'broken';
    const av = await svc.entities.AnswerVersion.get(result.lineage_id).catch(() => null);
    if (av) await svc.entities.AnswerVersion.update(result.lineage_id, {
      cognitive_state: { ...(av.cognitive_state || {}), certified, red_team_run_id: redTeam.run?.id || null, red_team_outcome: redTeam.outcome, red_team_severity: redTeam.severity },
    }).catch(() => {});
    await recordUsage(svc, auth.apiKey, 'warrantApi', CREDIT_COSTS.warrantApi, { model_label: body.model_label, domain: body.domain, lineage_id: result.lineage_id });
    await recordUserEvent(svc, {
      user_id: auth.apiKey.user_id, event_type: 'attest',
      trust_score: result.trust_score, verdict: result.verdict,
      domain: body.domain, stakes: body.stakes, source: 'api',
      linked_entity_type: 'AnswerVersion', linked_entity_id: result.lineage_id,
      metadata: { warrant_id: result.warrant_id, certified, red_team_outcome: redTeam.outcome },
    });
    return Response.json({ ...result, certified, certification: certified ? 'certified' : 'uncertified', red_team: { outcome: redTeam.outcome, severity: redTeam.severity, run_id: redTeam.run?.id || null } });
  } catch (error) {
    console.error('warrantApi error', error);
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
}