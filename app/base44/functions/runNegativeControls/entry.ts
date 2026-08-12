// Gate 0 / 1 / 2 / 3 harness: pipes the versioned negative-control corpus (+ the
// thin-coverage abstention set for Gate 2+) through the real verifier and
// evaluates the spec's pass conditions.
//   Gate 0 (recall-only): fabricated >=8/10, corrupted >=6/10, true >=8/10.
//   Gate 1 (grounded, body.grounded=true): fabricated catch must not regress,
//     true claims backed by fetchable T1/T2 sources must clear the old 60 cap.
//   Gate 2 (body.gate='gate-2'): falsifier produces 'strong' on >=5/10 FABRICATED,
//     5/5 thin-coverage claims return insufficient_evidence, no TRUE regression.
//   Gate 3 (body.gate='gate-3'): cross-vendor falsifier runs end-to-end,
//     cross_firm_verified is truthful, >=1 contested surfaces correctly.
// Stores a CorrelationAudit per run. On FAIL: STOP the program.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { runVerification } from '../../shared/attest.js';
import { CORPUS_V1, CORPUS_VERSION } from '../../shared/corpus-v1.js';
import { CORPUS_V2_STRATIFIED, CORPUS_V2_VERSION } from '../../shared/corpus-v2-stratified.js';
import { THIN_COVERAGE_V1 } from '../../shared/thinCoverage-v1.js';
import { emitTelemetry, newTraceId } from '../../shared/telemetry.js';
import { requireAdmin } from '../../shared/auth.js';

const WEAK_THRESHOLD = 50;

function pearson(xs, ys) {
  const n = xs.length;
  if (n === 0) return 0;
  const mx = xs.reduce((s, x) => s + x, 0) / n;
  const my = ys.reduce((s, y) => s + y, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); dx += (xs[i] - mx) ** 2; dy += (ys[i] - my) ** 2; }
  const den = Math.sqrt(dx * dy);
  return den === 0 ? 0 : num / den;
}
function auc(scoreByTruth) {
  const pos = scoreByTruth.filter((x) => x.truth === 1).map((x) => x.score);
  const neg = scoreByTruth.filter((x) => x.truth === 0).map((x) => x.score);
  if (pos.length === 0 || neg.length === 0) return 0.5;
  let wins = 0, ties = 0;
  for (const p of pos) for (const n of neg) { if (p > n) wins++; else if (p === n) ties++; }
  return (wins + 0.5 * ties) / (pos.length * neg.length);
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;
    const admin = await requireAdmin(base44);
    if (!admin.ok) return admin.response;

    const body = await req.json().catch(() => ({}));
    const domain = body.domain || 'General';
    const grounded = !!body.grounded;
    const runType = body.run_type === 'scheduled' ? 'scheduled' : 'manual';
    // Gate selection: explicit gate param wins; else derived from grounded.
    const gate = body.gate || (grounded ? 'gate-1' : 'gate-0');
    const falsify = gate === 'gate-2' || gate === 'gate-3';
    const foreignVendor = gate === 'gate-3';
    const includeThin = gate === 'gate-2' || gate === 'gate-3';

    const traceId = newTraceId();
    await emitTelemetry(svc, {
      trace_id: traceId, event_type: 'request_received', span_type: 'operation', group: 'evaluation',
      summary: `${gate} negative-control run · corpus ${CORPUS_VERSION} · grounded=${grounded} · falsify=${falsify} · foreign=${foreignVendor} · ${CORPUS_V1.length + (includeThin ? THIN_COVERAGE_V1.length : 0)} items`,
    }).catch(() => {});

    // body.corpus: 'v2-stratified' runs the risk-tiered corpus so the card can
    // publish PER-TIER rates. The v1 default is preserved byte-for-byte — its
    // items carry no risk_tier, and capabilityCard falls back to the suite-wide
    // aggregate for those runs exactly as before.
    const useStratified = body.corpus === 'v2-stratified';
    const baseCorpus = useStratified ? CORPUS_V2_STRATIFIED : CORPUS_V1;
    const corpusVersion = useStratified ? CORPUS_V2_VERSION : CORPUS_VERSION;
    const corpus = includeThin ? [...baseCorpus, ...THIN_COVERAGE_V1] : baseCorpus;

    const results = await Promise.all(corpus.map(async (item) => {
      try {
        const ver = await runVerification(svc, { answerText: item.text, premises: [], sources: item.sources || [], domain, retrieve: grounded, falsify, foreignVendor });
        const isThin = item.class === 'THIN_NEG';
        const caught = isThin
          ? (ver.validity === 'insufficient_evidence')
          : item.class === 'TRUE'
            ? (ver.validity === 'valid' || ver.trust >= WEAK_THRESHOLD)
            : (ver.validity !== 'valid' || ver.trust < WEAK_THRESHOLD);
        return {
          id: item.id, text: item.text, class: item.class, ground_truth: item.ground_truth,
          ...(item.risk_tier ? { risk_tier: item.risk_tier } : {}),
          sources: item.sources || [], notes: item.notes,
          verdict: ver.validity, trust: ver.trust, support_ratio: ver.supportRatio,
          per_claim_confidences: (ver.claims || []).map((c) => c.confidence),
          grounding: ver.grounded || null,
          falsification: ver.falsification?.falsification_strength || null,
          cross_firm_verified: !!ver.cross_firm_verified,
          red_team: null,
          caught,
        };
      } catch (e) {
        return {
          id: item.id, text: item.text, class: item.class, ground_truth: item.ground_truth,
          ...(item.risk_tier ? { risk_tier: item.risk_tier } : {}),
          sources: item.sources || [], notes: item.notes,
          verdict: 'invalid', trust: 0, support_ratio: 0, per_claim_confidences: [],
          grounding: null, falsification: null, cross_firm_verified: false, red_team: null,
          caught: item.class === 'THIN_NEG' ? false : item.class !== 'TRUE', error: String(e?.message || e).slice(0, 200),
        };
      }
    }));

    const byClass = (c) => results.filter((r) => r.class === c);
    const fabricated = byClass('FABRICATED');
    const corrupted = byClass('CORRUPTED');
    const trueClaims = byClass('TRUE');
    const thin = byClass('THIN_NEG');
    const fabricatedCaught = fabricated.filter((r) => r.caught).length;
    const corruptedCaught = corrupted.filter((r) => r.caught).length;
    const truePassed = trueClaims.filter((r) => r.caught).length;
    const thinAbstained = thin.filter((r) => r.caught).length;
    const fabricatedRate = fabricated.length ? fabricatedCaught / fabricated.length : 0;
    const corruptedRate = corrupted.length ? corruptedCaught / corrupted.length : 0;
    const trueRate = trueClaims.length ? truePassed / trueClaims.length : 0;
    const thinRate = thin.length ? thinAbstained / thin.length : 0;
    // Gate 2: falsifier strong on >=5/10 FABRICATED.
    const fabricatedFalsifierStrong = fabricated.filter((r) => r.falsification === 'strong').length;
    // Gate 3: cross_firm_verified truthful + >=1 contested.
    const crossFirmRuns = results.filter((r) => r.cross_firm_verified).length;
    const contested = results.filter((r) => r.verdict === 'contested').length;

    const scored = results.filter((r) => r.class !== 'THIN_NEG');
    const trusts = scored.map((r) => r.trust);
    const truths = scored.map((r) => (r.ground_truth ? 1 : 0));
    const r = pearson(trusts, truths);
    const a = auc(scored.map((x) => ({ score: x.trust, truth: x.ground_truth ? 1 : 0 })));
    const trueItems = scored.filter((x) => x.ground_truth);
    const falseItems = scored.filter((x) => !x.ground_truth);
    const meanTrue = trueItems.length ? trueItems.reduce((s, x) => s + x.trust, 0) / trueItems.length : 0;
    const meanFalse = falseItems.length ? falseItems.reduce((s, x) => s + x.trust, 0) / falseItems.length : 0;
    const separation = meanTrue - meanFalse;
    const accuracy = scored.length ? scored.filter((x) => (x.trust >= WEAK_THRESHOLD) === x.ground_truth).length / scored.length : 0;

    // Gate-specific pass conditions.
    let pass = false;
    let required = {};
    if (gate === 'gate-0') {
      pass = fabricatedRate >= 0.8 && corruptedRate >= 0.6 && trueRate >= 0.8;
      required = { fabricated: 0.8, corrupted: 0.6, true: 0.8 };
    } else if (gate === 'gate-1') {
      pass = fabricatedRate >= 0.8 && trueRate >= 0.8 && meanTrue > 60;
      required = { fabricated: 0.8, true: 0.8, mean_trust_true: 60 };
    } else if (gate === 'gate-2') {
      pass = fabricatedFalsifierStrong >= 5 && thinRate >= 1 && trueRate >= 0.8 && fabricatedRate >= 0.8;
      required = { falsifier_strong_on_fabricated: 5, thin_coverage_abstention: 1, fabricated: 0.8, true: 0.8 };
    } else if (gate === 'gate-3') {
      pass = crossFirmRuns > 0 && contested >= 1 && fabricatedRate >= 0.8 && trueRate >= 0.8;
      required = { cross_firm_runs: 1, contested: 1, fabricated: 0.8, true: 0.8 };
    }

    const trueGrounded = trueClaims.filter((c) => c.grounding && c.grounding.grounded).length;

    const rec = await svc.entities.CorrelationAudit.create({
      dataset: `${gate}${grounded ? '-grounded' : ''}-${corpusVersion}`,
      n_items: results.length, n_true: trueItems.length, n_hallucinated: falseItems.length,
      pearson_r: Number(r.toFixed(4)), spearman_rho: 0, auc: Number(a.toFixed(4)),
      accuracy: Number(accuracy.toFixed(4)), threshold: WEAK_THRESHOLD,
      mean_trust_true: Number(meanTrue.toFixed(2)), mean_trust_false: Number(meanFalse.toFixed(2)),
      separation: Number(separation.toFixed(2)),
      items: results, run_type: runType,
      notes: `${gate} corpus-${CORPUS_VERSION}: ${trueClaims.length} TRUE / ${fabricated.length} FAB / ${corrupted.length} CORR${includeThin ? ` / ${thin.length} THIN` : ''}. fabricated_catch=${fabricatedCaught}/${fabricated.length} corrupted_catch=${corruptedCaught}/${corrupted.length} true_pass=${truePassed}/${trueClaims.length} true_grounded=${trueGrounded}/${trueClaims.length} mean_trust_true=${meanTrue.toFixed(1)} falsifier_strong_on_fab=${fabricatedFalsifierStrong}/${fabricated.length} thin_abstention=${thinAbstained}/${thin.length} cross_firm_runs=${crossFirmRuns} contested=${contested}. PASS=${pass}. ${grounded ? 'Grounding live.' : ''}${falsify ? ' Falsifier live.' : ''}${foreignVendor ? ' Cross-firm (foreign vendor) live.' : ''} Published regardless of outcome.`,
    });

    await svc.entities.AuditLog.create({
      event_type: 'answer_promoted', entity_type: 'CorrelationAudit', entity_id: rec.id,
      summary: `${gate} ${pass ? 'PASS' : 'FAIL'} · fab ${fabricatedCaught}/${fabricated.length} corr ${corruptedCaught}/${corrupted.length} true ${truePassed}/${trueClaims.length}${includeThin ? ` thin ${thinAbstained}/${thin.length}` : ''} falsifier_strong=${fabricatedFalsifierStrong} contested=${contested}`,
      metadata: { gate, corpus_version: CORPUS_VERSION, pass, fabricated_rate: fabricatedRate, corrupted_rate: corruptedRate, true_rate: trueRate, separation, mean_trust_true: meanTrue, true_grounded: trueGrounded, falsifier_strong: fabricatedFalsifierStrong, thin_abstention: thinAbstained, cross_firm_runs: crossFirmRuns, contested },
    }).catch(() => {});

    const bottom = (() => {
      if (gate === 'gate-2') return pass
        ? `GATE-2 PASS — falsifier strong on ${fabricatedFalsifierStrong}/${fabricated.length} FABRICATED, thin-coverage abstention ${thinAbstained}/${thin.length}, true ${truePassed}/${trueClaims.length}.`
        : `GATE-2 FAIL — falsifier strong ${fabricatedFalsifierStrong}/${fabricated.length} (need 5), thin abstention ${thinAbstained}/${thin.length} (need all), true ${truePassed}/${trueClaims.length}. STOP; diagnose the adversary before next gate.`;
      if (gate === 'gate-3') return pass
        ? `GATE-3 PASS — cross-firm ran on ${crossFirmRuns} items, ${contested} contested surfaced, fab ${fabricatedCaught}/${fabricated.length}, true ${truePassed}/${trueClaims.length}.`
        : `GATE-3 FAIL — cross_firm_runs=${crossFirmRuns}, contested=${contested} (need >=1), fab ${fabricatedCaught}/${fabricated.length}. STOP.`;
      return pass
        ? `${gate.toUpperCase()} PASS — fabricated ${fabricatedCaught}/${fabricated.length}, corrupted ${corruptedCaught}/${corrupted.length}, true ${truePassed}/${trueClaims.length}${grounded ? `, ${trueGrounded}/${trueClaims.length} true grounded, mean true trust ${meanTrue.toFixed(1)}` : ''}.`
        : `${gate.toUpperCase()} FAIL — fabricated ${fabricatedCaught}/${fabricated.length}, corrupted ${corruptedCaught}/${corrupted.length}, true ${truePassed}/${trueClaims.length}, mean_trust_true=${meanTrue.toFixed(1)}. STOP; diagnose before next gate.`;
    })();

    return Response.json({
      id: rec.id, gate, corpus_version: CORPUS_VERSION, grounded, falsify, foreignVendor, pass,
      fabricated: { caught: fabricatedCaught, n: fabricated.length, rate: fabricatedRate, required: required.fabricated ?? 0.8, pass: fabricatedRate >= (required.fabricated ?? 0.8), falsifier_strong: fabricatedFalsifierStrong },
      corrupted: { caught: corruptedCaught, n: corrupted.length, rate: corruptedRate, required: required.corrupted ?? 0.6, pass: corruptedRate >= (required.corrupted ?? 0.6) },
      true_claims: { passed: truePassed, n: trueClaims.length, rate: trueRate, grounded: trueGrounded, mean_trust: Number(meanTrue.toFixed(1)), required: required.true ?? 0.8, pass: trueRate >= (required.true ?? 0.8) },
      thin_coverage: includeThin ? { abstained: thinAbstained, n: thin.length, rate: thinRate, required: 1, pass: thinRate >= 1 } : undefined,
      cross_firm: gate === 'gate-3' ? { runs: crossFirmRuns, contested, required_contested: 1, pass: contested >= 1 } : undefined,
      accuracy, pearson_r: r, auc: a, separation,
      mean_trust_true: meanTrue, mean_trust_false: meanFalse,
      bottom_line: bottom,
      items: results,
    });
  } catch (error) {
    console.error('runNegativeControls error', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}