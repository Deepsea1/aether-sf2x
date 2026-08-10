import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';
import { requireAdmin } from '../../shared/auth.js';
import { computeTrustworthyRate } from '../../shared/sf2xCore.js';
import { computeBenchScore, SECURITY_THRESHOLD } from '../../shared/sf2xSecurity.js';
import { runRedTeamAttack } from '../../shared/redTeam.js';

const ATTACK_VECTOR = 'prompt_injection';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;

    const body = await req.json().catch(() => ({}));
    const _auth = await requireAdmin(base44);
    if (!_auth.ok) return _auth.response;
    const inquiryId = (body.inquiry_id || '').toString().trim();
    if (!inquiryId) return Response.json({ error: 'inquiry_id is required' }, { status: 400 });

    const inquiry = await svc.entities.Inquiry.get(inquiryId).catch(() => null);
    if (!inquiry) return Response.json({ error: 'Inquiry not found' }, { status: 404 });

    const versions = await svc.entities.AnswerVersion.filter({ inquiry_id: inquiryId }, 'version', 50);
    if (!versions.length) return Response.json({ error: 'No answer version found yet' }, { status: 409 });
    const latest = versions[versions.length - 1];

    let warrant = null;
    if (latest.warrant_id) warrant = await svc.entities.Warrant.get(latest.warrant_id).catch(() => null);

    // 1. Run the red-team attack against the latest warranted answer (shared executor).
    const redTeam = await runRedTeamAttack(svc, {
      inquiryId: inquiry.id, answerVersionId: latest.id,
      prompt: inquiry.prompt, answerText: latest.answer_text, warrant, domain: inquiry.domain,
      attackVector: ATTACK_VECTOR, automated: true,
    });
    if (redTeam.error || !redTeam.run) {
      return Response.json({ error: redTeam.error || 'Red-team attack failed' }, { status: 502 });
    }

    // 2. Compute the deployment benchmark score (same model as the Bench dashboard), now including this run.
    const [allVersions, allWarrants, allCorrections, allRuns] = await Promise.all([
      svc.entities.AnswerVersion.list('-created_date', 500),
      svc.entities.Warrant.list('-created_date', 500),
      svc.entities.CorrectionEvent.list('-created_date', 500),
      svc.entities.RedTeamRun.list('-created_date', 500),
    ]);
    const wMap = new Map(allWarrants.map((w) => [w.id, w]));
    const withW = allVersions.map((v) => ({ ...v, warrant: wMap.get(v.warrant_id) }));
    const warrant_rate = allVersions.length ? withW.filter((v) => v.warrant && v.warrant.validity_status === 'valid').length / allVersions.length : 0;
    const trustAvg = withW.length ? withW.reduce((s, v) => s + computeTrustworthyRate(v.metrics, v.warrant), 0) / withW.length : 0;
    const correction_rate = allVersions.length ? allVersions.reduce((s, v) => s + (Number(v.metrics?.correction_rate) || 0), 0) / allVersions.length : 0;
    const mttc = allCorrections.length ? allCorrections.reduce((s, c) => s + (Number(c.time_to_correction) || 0), 0) / allCorrections.length : 0;
    const resistance_rate = allRuns.length ? allRuns.filter((x) => x.outcome === 'resisted').length / allRuns.length : 0;
    const drift_score = allCorrections.length ? allCorrections.reduce((s, c) => s + (Number(c.drift_score) || 0), 0) / allCorrections.length : 0;
    const bench_score = computeBenchScore({ warrant_rate, trustworthy_rate: trustAvg, correction_rate, mean_time_to_correction: mttc, resistance_rate, drift_score });

    const threshold = Number(secrets.get('SF2X_SECURITY_THRESHOLD')) || SECURITY_THRESHOLD;
    const below_threshold = bench_score < threshold;

    return Response.json({
      inquiry_id: inquiry.id,
      answer_version_id: latest.id,
      red_team_run_id: redTeam.run.id,
      attack_outcome: redTeam.outcome,
      severity: redTeam.severity,
      bench_score,
      threshold,
      below_threshold,
    });
  } catch (error) {
    console.error('runSecurityRedTeam error', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}