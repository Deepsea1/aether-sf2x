import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';
import { requireAdmin } from '../../shared/auth.js';
import { emitTelemetry, newTraceId } from '../../shared/telemetry.js';

// Drift Alert — computes aggregate model accuracy from recent ModelBenchRun
// records, compares against the established safety threshold and a prior-window
// baseline, and emails an admin summary whenever accuracy drifts outside bounds.

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function mean(arr, key) {
  if (!arr.length) return null;
  let s = 0, c = 0;
  for (const x of arr) {
    const v = Number(x[key]);
    if (Number.isFinite(v)) { s += v; c++; }
  }
  return c ? s / c : null;
}

function buildSummary(ctx) {
  const { recentMean, baselineMean, recentCorrectness, threshold, modelStats, signals, offenders, windowDays } = ctx;
  const lines = [];
  lines.push('SF2X MODEL ACCURACY DRIFT ALERT');
  lines.push('================================');
  lines.push('');
  lines.push(`Safety threshold: ${threshold}`);
  lines.push(`Recent mean trust (last ${windowDays}d): ${recentMean != null ? recentMean.toFixed(1) : 'n/a'}`);
  lines.push(`Baseline mean trust (prior window): ${baselineMean != null ? baselineMean.toFixed(1) : 'n/a'}`);
  lines.push(`Recent mean correctness: ${recentCorrectness != null ? recentCorrectness.toFixed(2) : 'n/a'}`);
  lines.push('');
  lines.push('TRIGGERED SIGNALS:');
  for (const s of signals) lines.push(`  - [${s.kind}] ${s.detail}`);
  lines.push('');
  lines.push('MODEL BREAKDOWN (recent window):');
  for (const m of modelStats) {
    lines.push(`  ${m.model.padEnd(28)} trust=${m.mean_trust != null ? m.mean_trust.toFixed(1) : 'n/a'}  correctness=${m.mean_correctness != null ? m.mean_correctness.toFixed(2) : 'n/a'}  runs=${m.runs}`);
  }
  if (offenders.length) {
    lines.push('');
    lines.push('OFFENDING MODELS (below threshold - 15):');
    for (const o of offenders) lines.push(`  - ${o.model} (mean trust ${o.mean_trust.toFixed(1)})`);
  }
  lines.push('');
  lines.push('Review the Drift dashboard: https://app.base44.app/drift');
  lines.push('— SF2X Epistemic Operating System');
  return lines.join('\n');
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const admin = await requireAdmin(base44);
    if (!admin.ok) return admin.response;
    const svc = base44.asServiceRole;

    const threshold = Number(secrets.get('SF2X_SECURITY_THRESHOLD')) || 60;
    const WINDOW_DAYS = 7;
    const BASELINE_DAYS = 28;
    const DROP_PTS = 10;

    const runs = await svc.entities.ModelBenchRun.list('-created_date', 400);
    const recentCutoff = daysAgo(WINDOW_DAYS);
    const baselineCutoff = daysAgo(BASELINE_DAYS);
    const recent = [];
    const baseline = [];
    for (const r of runs) {
      const d = r.question_date ? new Date(r.question_date + 'T00:00:00') : new Date(r.created_date);
      if (d >= recentCutoff) recent.push(r);
      else if (d >= baselineCutoff) baseline.push(r);
    }

    const recentMean = mean(recent, 'trust_score');
    const baselineMean = mean(baseline, 'trust_score');
    const recentCorrectness = mean(recent, 'correctness');

    const byModel = {};
    for (const r of recent) {
      const m = r.model_label || r.model;
      if (!byModel[m]) byModel[m] = [];
      byModel[m].push(r);
    }
    const modelStats = Object.entries(byModel).map(([model, rs]) => ({
      model, runs: rs.length,
      mean_trust: mean(rs, 'trust_score'),
      mean_correctness: mean(rs, 'correctness'),
    }));

    const signals = [];
    if (recentMean != null && recentMean < threshold) {
      signals.push({ kind: 'below_threshold', detail: `Mean trust ${recentMean.toFixed(1)} below threshold ${threshold}` });
    }
    if (recentMean != null && baselineMean != null && recentMean < baselineMean - DROP_PTS) {
      signals.push({ kind: 'downward_drift', detail: `Mean trust dropped ${(baselineMean - recentMean).toFixed(1)} pts vs baseline (was ${baselineMean.toFixed(1)})` });
    }
    const offenders = modelStats.filter((s) => s.mean_trust != null && s.mean_trust < threshold - 15);
    for (const o of offenders) {
      signals.push({ kind: 'model_collapse', detail: `${o.model} mean trust ${o.mean_trust.toFixed(1)} (threshold ${threshold})` });
    }

    const drifted = signals.length > 0;

    if (drifted) {
      const users = await svc.entities.User.list();
      const adminEmails = users.filter((u) => u.role === 'admin' && u.email).map((u) => u.email);
      const summary = buildSummary({ recentMean, baselineMean, recentCorrectness, threshold, modelStats, signals, offenders, windowDays: WINDOW_DAYS });
      for (const email of adminEmails) {
        await svc.integrations.Core.SendEmail({
          to: email,
          subject: `[SF2X] Model accuracy drift alert — ${signals.length} signal(s)`,
          body: summary,
        }).catch((e) => console.error('driftAlert email failed', email, e?.message || e));
      }

      await svc.entities.AuditLog.create({
        event_type: 'drift_alert',
        entity_type: 'ModelBenchRun',
        entity_id: 'aggregate',
        actor_id: (admin.user && admin.user.id) || 'system',
        summary: `Drift alert fired · ${signals.length} signal(s) · recent mean ${recentMean != null ? recentMean.toFixed(1) : 'n/a'} vs threshold ${threshold}`,
        metadata: { signals, recent_mean: recentMean, baseline_mean: baselineMean, threshold, offenders: offenders.map((o) => o.model), recipients: adminEmails },
      }).catch(() => {});

      await emitTelemetry(svc, {
        trace_id: newTraceId(), event_type: 'alert_triggered', span_type: 'operation', group: 'drift', severity: 'warn',
        drift: { recent_mean: recentMean, baseline_mean: baselineMean, threshold, signals },
        summary: `Drift alert fired · ${signals.length} signal(s)`,
      }).catch(() => {});
    }

    return Response.json({
      alert_sent: drifted,
      signals,
      recent_mean_trust: recentMean,
      baseline_mean_trust: baselineMean,
      recent_correctness: recentCorrectness,
      threshold,
      window_days: WINDOW_DAYS,
      model_stats: modelStats,
      offenders: offenders.map((o) => o.model),
    });
  } catch (error) {
    console.error('driftAlert error', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}