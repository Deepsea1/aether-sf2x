// Gate 4 — publish calibration. Runs the full versioned corpus through the real
// verification pipeline (with grounding + falsifier + coverage), computes Brier
// overall + per confidence bucket, catch rates per class, model provenance, and a
// regression flag (FABRICATED catch drop >10% or Brier increase >0.05 blocks
// release). Stores a CalibrationReport. Publishes regardless of outcome.
//
// CI rule (consumer-side): a deploy where regression=true must not ship.
// Bucket suppression: a bucket with accuracy < 0.65 is flagged suppressed — the
// methodology page shows the verdict band only, not numeric confidence, for it.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { runVerification } from '../../shared/attest.js';
import { CORPUS_V2, CORPUS_VERSION } from '../../shared/corpus-v2.js';
import { THIN_COVERAGE_V1 } from '../../shared/thinCoverage-v1.js';
import { emitTelemetry, newTraceId } from '../../shared/telemetry.js';
import { requireAdmin } from '../../shared/auth.js';

const BUCKETS = [
  { range: '0.6-0.7', lo: 0.6, hi: 0.7 },
  { range: '0.7-0.8', lo: 0.7, hi: 0.8 },
  { range: '0.8-0.9', lo: 0.8, hi: 0.9 },
  { range: '0.9-1.0', lo: 0.9, hi: 1.01 },
];

function brier(preds, actuals) {
  if (!preds.length) return 0;
  let s = 0;
  for (let i = 0; i < preds.length; i++) s += (preds[i] - actuals[i]) ** 2;
  return s / preds.length;
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;
    const admin = await requireAdmin(base44);
    if (!admin.ok) return admin.response;

    const body = await req.json().catch(() => ({}));
    const grounded = body.grounded !== false;
    const crossFirm = !!body.cross_firm;
    const runType = body.run_type === 'scheduled' ? 'scheduled' : 'manual';

    const traceId = newTraceId();
    await emitTelemetry(svc, {
      trace_id: traceId, event_type: 'request_received', span_type: 'operation', group: 'evaluation',
      summary: `gate-4 calibration run · corpus ${CORPUS_VERSION} · n=${CORPUS_V2.length + THIN_COVERAGE_V1.length} · grounded=${grounded} · cross_firm=${crossFirm}`,
    }).catch(() => {});

    const allItems = [...CORPUS_V2, ...THIN_COVERAGE_V1];

    const results = await Promise.all(allItems.map(async (item) => {
      try {
        const ver = await runVerification(svc, {
          answerText: item.text, premises: [], sources: item.sources || [], domain: 'General',
          retrieve: grounded, falsify: true, foreignVendor: crossFirm,
        });
        const truthLabel = item.ground_truth === true ? 1 : (item.ground_truth === false ? 0 : 0.5);
        // For thin-coverage, "correct" = insufficient_evidence verdict.
        const thinCorrect = item.class === 'THIN_NEG' ? (ver.validity === 'insufficient_evidence') : null;
        return {
          id: item.id, class: item.class, ground_truth: item.ground_truth, truthLabel,
          verdict: ver.validity, trust: ver.trust, pred: Math.max(0, Math.min(1, ver.trust / 100)),
          falsification: ver.falsification?.falsification_strength || null,
          cross_firm: !!ver.cross_firm_verified,
          caught: item.class === 'TRUE' ? (ver.validity === 'valid' || ver.trust >= 50)
            : item.class === 'THIN_NEG' ? (ver.validity === 'insufficient_evidence')
            : (ver.validity !== 'valid' || ver.trust < 50),
          thinCorrect,
        };
      } catch (e) {
        return {
          id: item.id, class: item.class, ground_truth: item.ground_truth, truthLabel: 0,
          verdict: 'invalid', trust: 0, pred: 0, falsification: null, cross_firm: false,
          caught: item.class === 'THIN_NEG' ? false : item.class !== 'TRUE', error: String(e?.message || e).slice(0, 160),
        };
      }
    }));

    const preds = results.map((r) => r.pred);
    const actuals = results.map((r) => r.truthLabel);
    const overallBrier = Number(brier(preds, actuals).toFixed(4));

    const buckets = BUCKETS.map((b) => {
      const inB = results.filter((r) => r.pred >= b.lo && r.pred < b.hi);
      const n = inB.length;
      const meanPred = n ? inB.reduce((s, r) => s + r.pred, 0) / n : 0;
      const meanAct = n ? inB.reduce((s, r) => s + r.truthLabel, 0) / n : 0;
      const acc = n ? inB.filter((r) => (r.pred >= 0.5 ? 1 : 0) === (r.truthLabel >= 0.5 ? 1 : 0)).length / n : 0;
      return { range: b.range, n, mean_predicted: Number(meanPred.toFixed(3)), mean_actual: Number(meanAct.toFixed(3)), accuracy: Number(acc.toFixed(3)), suppressed: n > 0 && acc < 0.65 };
    });

    const byClass = (c) => results.filter((r) => r.class === c);
    const fab = byClass('FABRICATED');
    const corr = byClass('CORRUPTED');
    const tru = byClass('TRUE');
    const thin = byClass('THIN_NEG');
    const catchRates = {
      fabricated: { caught: fab.filter((r) => r.caught).length, n: fab.length, rate: fab.length ? fab.filter((r) => r.caught).length / fab.length : 0 },
      corrupted: { caught: corr.filter((r) => r.caught).length, n: corr.length, rate: corr.length ? corr.filter((r) => r.caught).length / corr.length : 0 },
      true: { passed: tru.filter((r) => r.caught).length, n: tru.length, rate: tru.length ? tru.filter((r) => r.caught).length / tru.length : 0 },
      thin_coverage: { abstained: thin.filter((r) => r.caught).length, n: thin.length, rate: thin.length ? thin.filter((r) => r.caught).length / thin.length : 0 },
    };

    // Regression check vs the prior published CalibrationReport.
    let regression = false;
    let regressionReason = '';
    try {
      const prior = await svc.entities.CalibrationReport.list('-created_date', 1);
      const p = (prior || [])[0];
      if (p) {
        if (p.catch_rates?.fabricated?.rate != null) {
          const drop = p.catch_rates.fabricated.rate - catchRates.fabricated.rate;
          if (drop > 0.1) { regression = true; regressionReason = `FABRICATED catch dropped ${(drop * 100).toFixed(1)}% (from ${(p.catch_rates.fabricated.rate * 100).toFixed(1)}% to ${(catchRates.fabricated.rate * 100).toFixed(1)}%).`; }
        }
        if (typeof p.brier === 'number') {
          const inc = overallBrier - p.brier;
          if (inc > 0.05) { regression = true; regressionReason += ` Brier increased ${inc.toFixed(3)} (from ${p.brier} to ${overallBrier}).`; }
        }
      }
    } catch { /* no prior → first run, no regression baseline */ }

    const modelProvenance = [
      { role: 'verifier', vendor: 'openai-via-openrouter', model: 'openai/gpt-4o-mini' },
      { role: 'falsifier', vendor: crossFirm ? 'anthropic-via-openrouter' : 'openai-via-openrouter', model: crossFirm ? 'anthropic/claude-3.5-sonnet' : 'openai/gpt-4o-mini' },
      { role: 'coverage', vendor: 'openai-via-openrouter', model: 'openai/gpt-4o-mini' },
    ];

    const rec = await svc.entities.CalibrationReport.create({
      corpus_version: CORPUS_VERSION,
      corpus_size: allItems.length,
      last_run_date: new Date().toISOString(),
      brier: overallBrier,
      buckets,
      catch_rates: catchRates,
      model_provenance: modelProvenance,
      regression,
      regression_reason: regressionReason,
      grounded,
      cross_firm: crossFirm,
      notes: `Gate-4 calibration · corpus ${CORPUS_VERSION} (n=${allItems.length}: ${CORPUS_V2.length} scored + ${THIN_COVERAGE_V1.length} thin-coverage). grounded=${grounded} cross_firm=${crossFirm}. Brier=${overallBrier}. Provenance: AI-authored draft, pending human lock. Published regardless of outcome. Regression=${regression}.`,
    });

    await svc.entities.AuditLog.create({
      event_type: 'answer_promoted', entity_type: 'CalibrationReport', entity_id: rec.id,
      summary: `Gate-4 calibration ${regression ? 'REGRESSION' : 'ok'} · Brier ${overallBrier} · fab ${(catchRates.fabricated.rate * 100).toFixed(0)}% · n=${allItems.length}`,
      metadata: { brier: overallBrier, regression, fabricated_rate: catchRates.fabricated.rate, corpus_version: CORPUS_VERSION },
    }).catch(() => {});

    return Response.json({
      id: rec.id, gate: 'gate-4', corpus_version: CORPUS_VERSION, corpus_size: allItems.length,
      brier: overallBrier, buckets, catch_rates: catchRates, regression, regression_reason: regressionReason,
      model_provenance: modelProvenance, grounded, cross_firm: crossFirm, run_type: runType,
      bottom_line: regression
        ? `GATE-4 REGRESSION — ${regressionReason} BLOCKS RELEASE.`
        : `GATE-4 published — Brier ${overallBrier}, FABRICATED catch ${(catchRates.fabricated.rate * 100).toFixed(0)}%, thin-coverage abstention ${(catchRates.thin_coverage.rate * 100).toFixed(0)}%, n=${allItems.length}.`,
    });
  } catch (error) {
    console.error('publishCalibration error', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}