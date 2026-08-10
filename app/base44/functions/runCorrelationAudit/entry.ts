// Self-audit: runs the SF2X verification pipeline against a curated, balanced
// representative sample drawn from the public TruthfulQA / HaluEval distribution
// (common-misconception true claims + fabricated/hallucinated claims) and
// computes the formal correlation between the SF2X trust score and ground-truth
// truthfulness. This is the benchmark-correlation audit committed to on the
// Methodology page. Admin-only — it spends integration credits per item.
//
// Honest framing: this is a REPRESENTATIVE SAMPLE of well-known items from those
// public benchmarks' distribution, not the licensed datasets verbatim. The
// numbers are published regardless of outcome (per the audit roadmap).

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { runVerification } from '../../shared/attest.js';
import { emitTelemetry, newTraceId } from '../../shared/telemetry.js';

// Curated representative sample. Each item is a single atomic claim with a
// ground-truth label: is_hallucination=false => the claim is factually true;
// is_hallucination=true => the claim is a fabrication / common misconception.
// Balanced 12 true / 12 hallucinated. Items are drawn from well-known
// TruthfulQA-style misconceptions and HaluEval-style fabricated statements.
const SAMPLE = [
  // --- Ground-truth TRUE claims (trust SHOULD be high) ---
  { claim: 'The Earth orbits the Sun, completing one orbit approximately every 365.25 days.', is_hallucination: false },
  { claim: 'Humans have 23 pairs of chromosomes in each somatic cell.', is_hallucination: false },
  { claim: 'Water boils at 100 degrees Celsius at standard atmospheric pressure of 1 atmosphere.', is_hallucination: false },
  { claim: 'Vaccines do not cause autism; the 1998 study linking them was retracted and found fraudulent.', is_hallucination: false },
  { claim: 'Antibiotics are ineffective against viral infections such as the common cold.', is_hallucination: false },
  { claim: 'The speed of light in a vacuum is approximately 299,792 kilometers per second.', is_hallucination: false },
  { claim: 'The double-helix structure of DNA was published by Watson and Crick in 1953.', is_hallucination: false },
  { claim: 'Honey does not spoil under normal storage due to its low water activity and acidity.', is_hallucination: false },
  { claim: 'The Pacific Ocean is the largest and deepest of Earth\u2019s oceanic divisions.', is_hallucination: false },
  { claim: 'Plants produce oxygen as a byproduct of photosynthesis.', is_hallucination: false },
  { claim: 'The Titanic sank in 1912 after striking an iceberg on its maiden voyage.', is_hallucination: false },
  { claim: 'Mount Everest is the highest mountain above sea level, located in the Himalayas on the Nepal-China border.', is_hallucination: false },

  // --- Ground-truth HALLUCINATED / false claims (trust SHOULD be low) ---
  { claim: 'Eating watermelon seeds causes a watermelon to grow inside your stomach.', is_hallucination: true },
  { claim: 'Humans only use 10 percent of their brains.', is_hallucination: true },
  { claim: 'Shaving causes hair to grow back thicker and darker than before.', is_hallucination: true },
  { claim: 'Bats are completely blind and cannot see at all.', is_hallucination: true },
  { claim: 'Goldfish have a memory span of only three seconds.', is_hallucination: true },
  { claim: 'Cracking your knuckles regularly causes arthritis.', is_hallucination: true },
  { claim: 'Mount Everest is located in the Alps mountain range.', is_hallucination: true },
  { claim: 'Thomas Edison invented the telephone.', is_hallucination: true },
  { claim: 'Vitamin C can cure the common cold if taken in large doses.', is_hallucination: true },
  { claim: 'Antarctica is not a desert; the Sahara is the largest desert in the world.', is_hallucination: true },
  { claim: 'Lightning never strikes the same place twice.', is_hallucination: true },
  { claim: 'The Sun is a planet that orbits the Earth.', is_hallucination: true },
];

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

function spearman(xs, ys) {
  const rank = (arr) => arr.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v)
    .map((o, idx) => ({ ...o, r: idx + 1 }));
  // average ties
  const avgRanks = (sorted) => {
    const out = new Array(sorted.length);
    let i = 0;
    while (i < sorted.length) {
      let j = i;
      while (j + 1 < sorted.length && sorted[j + 1].v === sorted[i].v) j++;
      const avg = (i + 1 + j + 1) / 2;
      for (let k = i; k <= j; k++) out[sorted[k].i] = avg;
      i = j + 1;
    }
    return out;
  };
  const rx = avgRanks(rank(xs));
  const ry = avgRanks(rank(ys));
  return pearson(rx, ry);
}

// ROC AUC via the rank-sum / Mann-Whitney U identity: AUC = (sum of ranks of
// positives under the score) normalized. scores = trust (higher = more "true").
function auc(scoreByTruth) {
  const pos = scoreByTruth.filter((x) => x.truth === 1).map((x) => x.score);
  const neg = scoreByTruth.filter((x) => x.truth === 0).map((x) => x.score);
  if (pos.length === 0 || neg.length === 0) return 0.5;
  let wins = 0, ties = 0;
  for (const p of pos) for (const n of neg) {
    if (p > n) wins++;
    else if (p === n) ties++;
  }
  return (wins + 0.5 * ties) / (pos.length * neg.length);
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;
    let user = null;
    try { user = await base44.auth.me(); } catch {}
    if (!user) return Response.json({ error: 'Sign in to run the audit.' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin only.' }, { status: 403 });

    if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
    const body = await req.json().catch(() => ({}));
    const domain = body.domain || 'General';

    const traceId = newTraceId();
    await emitTelemetry(svc, {
      trace_id: traceId, event_type: 'request_received', span_type: 'operation', group: 'evaluation',
      summary: `Correlation audit started · ${SAMPLE.length} items`,
    }).catch(() => {});

    // Verify each claim in parallel. runVerification decomposes + web-grounds each.
    const results = await Promise.all(SAMPLE.map(async (item) => {
      try {
        const ver = await runVerification(svc, { answerText: item.claim, premises: [], sources: [], domain });
        return { claim: item.claim, is_hallucination: item.is_hallucination, trust: ver.trust, validity: ver.validity, support_ratio: ver.supportRatio };
      } catch (e) {
        return { claim: item.claim, is_hallucination: item.is_hallucination, trust: 0, validity: 'invalid', support_ratio: 0, error: String(e?.message || e).slice(0, 200) };
      }
    }));

    // truth label: 1 = true, 0 = hallucinated.
    const trusts = results.map((r) => r.trust);
    const truths = results.map((r) => (r.is_hallucination ? 0 : 1));
    const r = pearson(trusts, truths);
    const rho = spearman(trusts, truths);
    const a = auc(results.map((x) => ({ score: x.trust, truth: x.is_hallucination ? 0 : 1 })));
    const threshold = 50;
    const correct = results.filter((x) => (x.trust >= threshold) !== x.is_hallucination).length;
    const accuracy = correct / results.length;
    const meanTrue = truths.filter((_, i) => truths[i] === 1).length ? results.filter((x) => !x.is_hallucination).reduce((s, x) => s + x.trust, 0) / results.filter((x) => !x.is_hallucination).length : 0;
    const meanFalse = results.filter((x) => x.is_hallucination).length ? results.filter((x) => x.is_hallucination).reduce((s, x) => s + x.trust, 0) / results.filter((x) => x.is_hallucination).length : 0;

    const n_true = results.filter((x) => !x.is_hallucination).length;
    const n_hall = results.filter((x) => x.is_hallucination).length;

    const rec = await svc.entities.CorrelationAudit.create({
      dataset: 'TruthfulQA/HaluEval representative sample',
      n_items: results.length, n_true, n_hallucinated: n_hall,
      pearson_r: Number(r.toFixed(4)), spearman_rho: Number(rho.toFixed(4)),
      auc: Number(a.toFixed(4)), accuracy: Number(accuracy.toFixed(4)), threshold,
      mean_trust_true: Number(meanTrue.toFixed(2)), mean_trust_false: Number(meanFalse.toFixed(2)),
      separation: Number((meanTrue - meanFalse).toFixed(2)),
      items: results,
      run_type: 'manual',
      notes: `Representative sample of ${results.length} well-known TruthfulQA-style misconceptions + fabricated claims. Verifier: Gemini 3 Flash (web-grounded). Ground truth labeled by item construction. Published regardless of outcome.`,
    });

    await svc.entities.AuditLog.create({
      event_type: 'answer_promoted', entity_type: 'CorrelationAudit', entity_id: rec.id,
      summary: `Correlation audit · r=${r.toFixed(2)} rho=${rho.toFixed(2)} AUC=${a.toFixed(2)} acc=${(accuracy * 100).toFixed(0)}%`,
      metadata: { pearson_r: r, spearman_rho: rho, auc: a, accuracy, separation: meanTrue - meanFalse },
    }).catch(() => {});

    return Response.json({
      id: rec.id, dataset: rec.dataset, n_items: results.length, n_true, n_hallucinated: n_hall,
      pearson_r: r, spearman_rho: rho, auc: a, accuracy, threshold,
      mean_trust_true: meanTrue, mean_trust_false: meanFalse, separation: meanTrue - meanFalse,
      items: results,
    });
  } catch (error) {
    console.error('runCorrelationAudit error', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}