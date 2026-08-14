import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveApiKey, checkQuota, recordUsage, planBatchCharge, CREDIT_COSTS } from '../../shared/apiAuth.js';
import { modelAssessedDecision, exposeTruthDecision } from '../../shared/truthContract.js';

// verifyBatch — retroactive audit of existing AI transcripts/logs. Accepts up
// to 10 texts (items[] or newline-separated csv) and runs the fast verification
// on each in parallel, returning a per-item verdict + trust score + corrections.
// Larger batches are rejected with 400 (no silent truncation) — chunk them
// client-side. The whole batch must also fit the caller's remaining credits
// before any LLM call runs (MASTER_PLAN v5 §7.3).

const SCHEMA = {
  type: 'object',
  properties: {
    claims: { type: 'array', items: { type: 'object', properties: { claim: { type: 'string' }, supported: { type: 'boolean' } }, required: ['claim', 'supported'] } },
    corrections: { type: 'array', items: { type: 'string' } },
    verdict: { type: 'string', enum: ['verified', 'contested', 'rejected'] },
    trust_score: { type: 'number' },
  },
  required: ['claims', 'corrections', 'verdict', 'trust_score'],
};

function num(x) { const n = Number(x); return Number.isFinite(n) ? n : 0; }

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;
    const body = await req.json().catch(() => ({}));
    let items = Array.isArray(body.items) ? body.items : [];
    if (!items.length && body.csv) {
      items = String(body.csv).split(/\n+/).map((l) => l.trim()).filter(Boolean).map((t) => ({ text: t }));
    }
    items = items.map((i) => ({ text: String(i.text || '').trim(), domain: String(i.domain || 'General') })).filter((i) => i.text);
    if (!items.length) return Response.json({ error: 'Provide items[] or csv (up to 10)' }, { status: 400 });
    // Explicit reject, not silent truncation: trimming a batch to fit and billing
    // the remainder is how customers get surprise results (MASTER_PLAN v5 §7.3).
    if (items.length > 10) return Response.json({ error: 'Max 10 items per batch' }, { status: 400 });

    const auth = await resolveApiKey(svc, req);
    if (!auth.ok) return auth.response;
    const apiKey = auth.apiKey;
    const quota = await checkQuota(svc, apiKey, 'verifyResponse');
    if (!quota.allowed) return Response.json({ error: 'Monthly verification quota exceeded', plan: quota.plan, limit: quota.limit, remaining: 0 }, { status: 429 });
    // Whole-batch headroom (MASTER_PLAN v5 §7.3): this endpoint bills per text,
    // so the whole batch must fit the remaining credits BEFORE any tribunal call
    // runs — 1 remaining credit no longer admits a full batch. A rejected batch
    // runs nothing and charges nothing.
    const charge = planBatchCharge({ plan: quota.plan, remaining: quota.remaining, endpoint: 'verifyResponse', itemCount: items.length });
    if (!charge.allowed) return Response.json({ error: charge.reason, plan: quota.plan, limit: quota.limit, remaining: quota.remaining }, { status: charge.status });

    const results = await Promise.all(items.map(async (it, itemIndex) => {
      try {
        const prompt = `You are the Aether verification engine. Check this AI-generated text for hallucinations. Decompose into claims, judge each supported/unsupported, list corrections, render a verdict (verified/contested/rejected), and assign a calibrated trust score 0-100 (never 100).

TEXT:
"""${it.text}"""

DOMAIN: ${it.domain}
Respond as a single JSON object.`;
        const res = await svc.integrations.Core.InvokeLLM({ prompt, response_json_schema: SCHEMA, model: 'gpt_5_mini' });
        const v = (res && res.data) ? res.data : res;
        const trust = Math.max(0, Math.min(100, Math.round(num(v.trust_score))));
        const verdict = v.verdict || (trust >= 75 ? 'verified' : trust >= 50 ? 'contested' : 'rejected');
        const corrections = Array.isArray(v.corrections) ? v.corrections : [];
        const truthDecision = modelAssessedDecision({ claim_id: `verify-batch-${itemIndex}`, policy_id: 'verify-batch-model-assessment', policy_version: '1', missing_evidence: ['retrieved applicable evidence required for a final factual status'] });
        return { text: it.text.slice(0, 200), trust_score: trust, verdict, ...exposeTruthDecision(truthDecision), corrections, issues: corrections.length };
      } catch (e) {
        return { text: it.text.slice(0, 200), error: e?.message || 'failed' };
      }
    }));

    if (apiKey) await recordUsage(svc, apiKey, 'verifyResponse', (CREDIT_COSTS.verifyResponse || 2) * results.length, { batch: results.length });

    const verified = results.filter((r) => r.verdict === 'verified').length;
    const flagged = results.filter((r) => r.verdict !== 'verified').length;
    return Response.json({ count: results.length, verified, flagged, results });
  } catch (error) {
    console.error('verifyBatch error', error);
    return Response.json({ error: error.message || 'batch failed' }, { status: 500 });
  }
}
