import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';
import { requireAdmin } from '../../shared/auth.js';
import { emitTelemetry, newTraceId } from '../../shared/telemetry.js';
import { MODES, getActiveMode, setMode } from '../../shared/serviceMode.js';
import { publicKeyId } from '../../shared/canonicalSign.js';

// Drift Alert — computes aggregate model accuracy from recent ModelBenchRun
// records, compares against the established safety threshold and a prior-window
// baseline, and emails an admin summary whenever accuracy drifts outside bounds.
//
// CONSOLIDATED OPS (the platform's 50-function cap): this function also hosts
// the §15 service-mode + drift-tripwire capabilities. body.op — or ?op= in the
// URL query string, so plain GETs work — selects:
//   'mode'             — public: current service mode + last 10 transitions
//                        (§13.4 'label every API response and UI session'
//                        starts with an inspectable mode)
//   'set_mode'         — admin: explicit mode transition; clearing a degraded
//                        mode back to 'normal' is also through here — explicit
//                        authority, per §15.4
//   'check_indicators' — admin/workflow: compute the §15.2 tripwires that are
//                        measurable today; automation may only DOWNGRADE
//                        (normal → degraded), it never clears a degraded mode
// An unknown op is a 400 fail-closed; no op at all is the original drift-alert
// run below, unchanged.

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

// ——— op=mode — the public service-mode label (§15.4: 'label every API
// response and UI session with service mode' — a label nobody can read is no
// label, so this op needs no auth). Returns the current mode plus the last 10
// transitions. The projection deliberately omits actor_id: the public surface
// labels system STATE, not admin identity. A mode-store read failure rides out
// as mode_read_error with the 'normal' fallback — the serviceMode.js law that
// degradation is never hidden silently.
async function opMode(svc) {
  try {
    const active = await getActiveMode(svc);
    const rows = await svc.entities.ServiceModeEvent.list('-created_date', 10).catch(() => null);
    const out = {
      mode: active.mode,
      since: active.since ?? null,
      reason: active.reason ?? null,
      transitions: (rows || []).map((e) => ({
        at: e.created_date,
        mode: e.mode,
        previous_mode: e.previous_mode ?? null,
        reason: e.reason ?? null,
        auto: e.auto === true,
        indicator: e.indicator ?? null,
      })),
    };
    if (active.mode_read_error) out.mode_read_error = true;
    if (rows === null) out.transitions_read_error = true;
    return Response.json(out);
  } catch (error) {
    console.error('driftAlert op=mode error', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// ——— op=set_mode — explicit admin mode transition (§15.4: explicit authority
// required to enter and clear emergency modes). Clearing a degraded mode back
// to 'normal' goes through here too — automation only ever downgrades and
// never clears (see opCheckIndicators). The appended ServiceModeEvent row is
// itself the immutable transition record §15.4 requires.
async function opSetMode(svc, body, admin) {
  try {
    const mode = body.mode;
    const reason = String(body.reason || '').trim();
    if (!MODES.includes(mode)) {
      return Response.json({ error: `mode must be one of: ${MODES.join(', ')}` }, { status: 400 });
    }
    if (!reason) {
      return Response.json({ error: 'reason is required — every transition records why (§15.4)' }, { status: 400 });
    }
    const event = await setMode(svc, { mode, reason, actor_id: (admin.user && admin.user.id) || 'system', auto: false });
    if (event && event.error) {
      return Response.json({ error: `mode transition failed: ${event.error}` }, { status: 500 });
    }
    // Entering a non-normal mode reads as an incident opening; returning to
    // 'normal' as its resolution — the closest events in the fixed telemetry
    // taxonomy. Additive observability only; never blocks the transition.
    await emitTelemetry(svc, {
      trace_id: newTraceId(),
      event_type: mode === 'normal' ? 'incident_resolved' : 'incident_opened',
      span_type: 'operation', group: 'governance', severity: mode === 'normal' ? 'info' : 'warn',
      linked_entity_type: 'ServiceModeEvent', linked_entity_id: event.id,
      governance: { service_mode: mode, previous_mode: event.previous_mode ?? null, auto: false },
      summary: `Service mode set to ${mode} (was ${event.previous_mode || 'unknown'}) — ${reason.slice(0, 140)}`,
    }).catch(() => {});
    return Response.json({
      set: true,
      mode,
      previous_mode: event.previous_mode ?? null,
      event_id: event.id,
      reason,
    });
  } catch (error) {
    console.error('driftAlert op=set_mode error', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// ——— op=check_indicators — the §15.2 drift tripwires MEASURABLE TODAY, wired
// to the breaker rule: automation may only DOWNGRADE (normal → degraded), with
// auto:true and the indicator name on the appended event; it NEVER clears a
// degraded mode (that is op=set_mode — explicit human authority, §15.4). Every
// §15.2 indicator with no data source yet is declared in declared_unmeasured
// rather than silently skipped — silence is not coverage.
async function opCheckIndicators(svc, admin) {
  try {
    const now = Date.now();
    const DAY_MS = 24 * 60 * 60 * 1000;
    const before = await getActiveMode(svc);
    const indicators = [];

    // (c) Key/signing health — the §15.1 signing boundary ('key or
    // canonicalization failure → halt issuance'). publicKeyId() returns null
    // exactly when the ED25519_PUBLIC_KEY secret is absent: nothing can be
    // attested, so the honest mode is signing_degraded.
    const keyId = await publicKeyId().catch(() => null);
    indicators.push({
      indicator: 'signing_key_health',
      tripped: keyId === null,
      target_mode: 'signing_degraded',
      detail: keyId === null
        ? 'Ed25519 signing keys are not configured (publicKeyId() returned null) — warrant/tree-head issuance cannot be attested (§15.1: halt issuance)'
        : `Ed25519 signing key present (${keyId})`,
    });

    // (b) Review overturn pressure — the measurable half of §15.2's first
    // tripwire ('challenge-overturn rate ↑'): when the MAJORITY of humanly
    // decided gate reviews in the last 14 days reject what the pipeline
    // surfaced (n >= 5, so one bad afternoon cannot trip a breaker), human
    // judgment is systematically overturning automation — manual_review_only
    // is the §15.3 downgrade-automation-require-review level.
    const reviews = await svc.entities.Review.filter({ review_type: 'gate' }, '-created_date', 500).catch(() => null);
    const decided = (reviews || []).filter((r) => {
      if (r.status !== 'approved' && r.status !== 'rejected') return false;
      const t = new Date(r.decided_at || r.decided_date || '').getTime();
      return Number.isFinite(t) && now - t <= 14 * DAY_MS;
    });
    const rejectedCount = decided.filter((r) => r.status === 'rejected').length;
    const overturnShare = decided.length ? rejectedCount / decided.length : null;
    const overturnTripped = decided.length >= 5 && overturnShare > 0.5;
    const overturnInd = {
      indicator: 'review_overturn_pressure',
      tripped: overturnTripped,
      target_mode: 'manual_review_only',
      decided_14d: decided.length,
      rejected_14d: rejectedCount,
      overturn_share: overturnShare != null ? Number(overturnShare.toFixed(4)) : null,
      detail: reviews === null
        ? 'Review store read failed — indicator not computable this run (reported, never a silent pass)'
        : overturnTripped
          ? `${rejectedCount}/${decided.length} decided gate reviews rejected in 14d (share > 0.5 with n >= 5) — human judgment is overturning the pipeline`
          : `${rejectedCount}/${decided.length} decided gate reviews rejected in 14d — below the >0.5-share-with-n>=5 tripwire`,
    };
    if (reviews === null) overturnInd.read_error = true;
    indicators.push(overturnInd);

    // (a) Cache suspicious-quiet — §15.2: 'Reuse rate ≈ 100% with zero
    // invalidations → audit the cache — suspiciously quiet is a signal'.
    // APPROXIMATION, computed from VerdictReuse rows (limits documented):
    //   · every row CREATION was a cache miss that stored, so over the 7-day
    //     window hit_rate ≈ total_hits / (total_hits + rows_created_7d);
    //   · hit_count is best-effort accounting (recordHit never blocks) and can
    //     undercount — which UNDERSTATES the rate, never falsely trips;
    //   · rows are never deleted, so 'invalidated' is measurable only as TTL
    //     expiry (expires_at passing within the window); a PIPELINE_VERSION
    //     bump invalidates by CHANGING KEYS and is invisible to this count;
    //   · '≈ 100%' = rate >= 0.98 with real traffic (total hits >= 50).
    // MAPPING — deliberately REPORT-ONLY, no auto transition: §15.2's
    // prescribed action is 'audit the cache', a human audit, not a service
    // degradation. A suspiciously quiet cache does not degrade model
    // evaluation itself, and forcing model_evaluation_degraded would (via
    // DEGRADED_FORCES_ADVISORY) flip every verdict to advisory on an
    // unconfirmed suspicion. The tripped report is the honest output; an
    // admin decides the mode via op=set_mode.
    const cacheRows = await svc.entities.VerdictReuse.list('-created_date', 500).catch(() => null);
    let totalHits = 0;
    let maxHit = 0;
    let created7d = 0;
    let expired7d = 0;
    for (const r of cacheRows || []) {
      const h = Number(r.hit_count) || 0;
      totalHits += h;
      if (h > maxHit) maxHit = h;
      const c = new Date(r.created_date || '').getTime();
      if (Number.isFinite(c) && now - c <= 7 * DAY_MS) created7d++;
      const e = new Date(r.expires_at || '').getTime();
      if (Number.isFinite(e) && e <= now && now - e <= 7 * DAY_MS) expired7d++;
    }
    const hitRate = totalHits + created7d > 0 ? totalHits / (totalHits + created7d) : null;
    const cacheTripped = (cacheRows || []).length > 0 && totalHits >= 50 && expired7d === 0 && hitRate !== null && hitRate >= 0.98;
    const cacheInd = {
      indicator: 'cache_suspicious_quiet',
      tripped: cacheTripped,
      target_mode: null, // report-only — see the mapping comment above
      rows_sampled: (cacheRows || []).length,
      total_hits: totalHits,
      max_hit_count: maxHit,
      rows_created_7d: created7d,
      rows_expired_7d: expired7d,
      approx_hit_rate_7d: hitRate != null ? Number(hitRate.toFixed(4)) : null,
      detail: cacheRows === null
        ? 'VerdictReuse store read failed — indicator not computable this run (reported, never a silent pass)'
        : cacheTripped
          ? `reuse cache suspiciously quiet: ~${(hitRate * 100).toFixed(1)}% approx hit rate over 7d with zero TTL expiries and ${totalHits} recorded hits — audit the cache (§15.2)`
          : 'no suspicious-quiet signal (needs rows present, >= 50 total hits, zero 7d TTL expiries, and an approx hit rate >= 0.98)',
    };
    if (cacheRows === null) cacheInd.read_error = true;
    indicators.push(cacheInd);

    // Auto-transition — DOWNGRADE ONLY, and only from a TRUSTED 'normal'
    // reading: a mode_read_error 'normal' is a fallback label, not evidence
    // the system actually is in normal mode, so automation stands down. When
    // the mode is already degraded nothing transitions here — including when
    // every indicator is clean: automation never clears a degraded mode
    // (§15.4 explicit authority — op=set_mode). One transition per run, most
    // severe first (signing integrity before review pressure); the report
    // still lists every indicator either way.
    let transition = null;
    if (before.mode === 'normal' && !before.mode_read_error) {
      for (const name of ['signing_key_health', 'review_overturn_pressure']) {
        const ind = indicators.find((i) => i.indicator === name);
        if (!ind || !ind.tripped || !ind.target_mode) continue;
        const event = await setMode(svc, {
          mode: ind.target_mode,
          reason: `auto tripwire ${ind.indicator}: ${ind.detail}`,
          actor_id: (admin.user && admin.user.id) || 'system',
          auto: true,
          indicator: ind.indicator,
        });
        if (event && event.error) {
          transition = { attempted: ind.target_mode, indicator: ind.indicator, error: event.error };
        } else {
          transition = { from: 'normal', to: ind.target_mode, indicator: ind.indicator, event_id: event.id };
          await emitTelemetry(svc, {
            trace_id: newTraceId(), event_type: 'drift_detected', span_type: 'operation', group: 'drift', severity: 'warn',
            linked_entity_type: 'ServiceModeEvent', linked_entity_id: event.id,
            drift: { indicator: ind.indicator, target_mode: ind.target_mode, auto: true },
            summary: `Auto-downgrade normal → ${ind.target_mode} · tripwire ${ind.indicator}`,
          }).catch(() => {});
        }
        break;
      }
    }

    // §15.2 indicators with NO data source yet — declared, never silently
    // skipped. Each names the missing store that would make it measurable.
    const declared_unmeasured = [
      { indicator: 'favorable_rate_rise', reason: "the other half of §15.2's first tripwire (favorable rate ↑ alongside overturn ↑) — no favorable-issuance-rate time series is stored yet; only the overturn half is measured today (review_overturn_pressure)" },
      { indicator: 'independence_drop_in_domain', reason: 'independence clusters (§5.6) are computed per-request and never aggregated into a per-domain time series — nothing to trend against yet' },
      { indicator: 'source_change_cascade_sla', reason: 'no revalidation queue with SLA state exists yet — revalidateWarrant runs on demand and records no cascade backlog to miss' },
      { indicator: 'reviewer_agreement_collapse', reason: 'decided_by is recorded on reviews but no per-reviewer agreement/calibration baseline is stored — collapse and dominance need a baseline to deviate from' },
      { indicator: 'extension_extraction_error_spike', reason: 'the extension reports no extraction-error telemetry stream back to the app — no store to measure a spike in' },
      { indicator: 'policy_change_without_test_suite', reason: 'Policy rows carry no linkage to evaluated test-suite runs — the precondition (an evaluated suite) is not represented in data yet' },
    ];

    const out = {
      mode_before: before.mode,
      mode_after: transition && transition.to ? transition.to : before.mode,
      transition,
      indicators,
      declared_unmeasured,
    };
    if (before.mode_read_error) out.mode_read_error = true;
    return Response.json(out);
  } catch (error) {
    console.error('driftAlert op=check_indicators error', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export default async function(req) {
  try {
    // The op is peeked off a clone of the request so nothing downstream ever
    // sees a consumed body (the keyExpirySweep idiom); ?op= in the query
    // string also selects an op so a plain GET works (the warrantRegistry
    // idiom — op=mode is a public GET). Unknown op → 400 before any work.
    const peeked = (await req.clone().json().catch(() => ({}))) || {};
    const op = peeked.op !== undefined ? peeked.op : (new URL(req.url).searchParams.get('op') || undefined);
    if (op !== undefined && op !== 'mode' && op !== 'set_mode' && op !== 'check_indicators') {
      return Response.json({ error: 'unknown op' }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);

    // op=mode is PUBLIC read-only, ahead of the admin gate — see opMode.
    if (op === 'mode') return await opMode(base44.asServiceRole);

    const admin = await requireAdmin(base44);
    if (!admin.ok) return admin.response;
    const svc = base44.asServiceRole;

    // Admin (and workflow-service) gated ops — the keyExpirySweep gate above.
    if (op === 'set_mode') return await opSetMode(svc, peeked, admin);
    if (op === 'check_indicators') return await opCheckIndicators(svc, admin);

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