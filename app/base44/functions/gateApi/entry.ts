import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';
import { resolveApiKey, checkQuota, recordUsage, CREDIT_COSTS } from '../../shared/apiAuth.js';
import { computeTrustworthyRate } from '../../shared/sf2xCore.js';
import { isCertifiedRun } from '../../shared/redTeam.js';
import { fireWebhooks } from '../../shared/webhooks.js';
import { recordUserEvent } from '../../shared/userMetrics.js';

// Gate API — callable suppression gate. A business pipes its AI answer's lineage
// id through this and receives an allow / escalate / suppress decision plus the
// reason, so low-trust or fabricated answers never reach end users.

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;
    const auth = await resolveApiKey(svc, req, { base44 });
    if (!auth.ok) return auth.response;
    const quota = await checkQuota(svc, auth.apiKey, 'gateApi');
    if (!quota.allowed) return Response.json({ error: 'Monthly credit quota exceeded', plan: quota.plan, limit: quota.limit, used: quota.used, remaining: 0 }, { status: 429 });

    const body = await req.json().catch(() => ({}));
    const id = String(body.answer_version_id || body.lineage_id || '').trim();
    if (!id) return Response.json({ error: 'answer_version_id is required' }, { status: 400 });

    let av;
    try { av = await svc.entities.AnswerVersion.get(id); }
    catch { return Response.json({ error: 'Not found' }, { status: 404 }); }

    let warrant = null;
    if (av.warrant_id) warrant = await svc.entities.Warrant.get(av.warrant_id).catch(() => null);

    // Certification: a tribunal lineage is only certified if it ran the red-team
    // loop (default stage) and resisted/wobbled. Historical runs + single-answer
    // attestations that skipped red-team are flagged uncertified here.
    const redTeamRuns = await svc.entities.RedTeamRun.filter({ target_id: av.id }).catch(() => []);
    const certified = isCertifiedRun(av, redTeamRuns);
    const redTeam = redTeamRuns.find((r) => r.outcome && r.outcome !== 'error') || null;

    const trust = av.trust_score != null ? av.trust_score : computeTrustworthyRate(av.metrics || {}, warrant || {});
    const stakes = av.stakes_level || 'medium';
    const threshold = Number(secrets.get('SF2X_SECURITY_THRESHOLD')) || 60;

    let decision = 'allow';
    let level = 'L1';
    let reason = `Trust ${trust} above threshold ${threshold}`;
    if (warrant && warrant.validity_status === 'invalid') {
      decision = 'suppress'; level = 'L4'; reason = 'Warrant invalid (fabricated/unsupported)';
    } else if (trust < threshold) {
      decision = 'suppress'; level = 'L3'; reason = `Trust ${trust} below threshold ${threshold}`;
    } else if (warrant && warrant.validity_status === 'weak') {
      decision = 'escalate'; level = 'L2'; reason = 'Warrant weak — route to review';
    } else if (stakes === 'critical' && trust < 80) {
      decision = 'escalate'; level = 'L3'; reason = 'Critical stakes with moderate trust';
    }

    await recordUsage(svc, auth.apiKey, 'gateApi', CREDIT_COSTS.gateApi, { lineage_id: av.id });
    if (decision === 'suppress' || decision === 'escalate') {
      await fireWebhooks(svc, decision === 'suppress' ? 'gate.suppress' : 'gate.escalate', {
        decision, gate_level: level, trust_score: trust, reason,
        answer_version_id: av.id, url: `/verify/${av.id}`,
        summary: `${decision.toUpperCase()} · ${reason}`,
      }, auth.apiKey.user_id).catch(() => {});
    }
    await recordUserEvent(svc, {
      user_id: auth.apiKey.user_id, event_type: 'gate',
      trust_score: trust, verdict: decision,
      stakes, source: 'api',
      linked_entity_type: 'AnswerVersion', linked_entity_id: av.id,
      metadata: { gate_level: level, certified, warrant_status: warrant ? warrant.validity_status : 'unknown' },
    });
    return Response.json({
      decision,
      gate_level: level,
      trust_score: trust,
      warrant_status: warrant ? warrant.validity_status : 'unknown',
      stakes,
      certified,
      certification: certified ? 'certified' : 'uncertified',
      red_team: redTeam ? { outcome: redTeam.outcome, severity: redTeam.severity, run_id: redTeam.id } : null,
      reason: certified ? reason : `${reason}${reason ? ' · ' : ''}uncertified — red-team loop not run`,
      answer_version_id: av.id,
    });
  } catch (error) {
    console.error('gateApi error', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}