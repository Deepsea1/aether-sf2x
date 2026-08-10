import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveApiKey, checkQuota, recordUsage, planBatchCharge, CREDIT_COSTS } from '../../shared/apiAuth.js';

// batchVerify — the public batch verification endpoint documented in
// docs/API_REFERENCE.md ("Batch Verify": texts[] up to 50 → per-text verdicts +
// a batch summary). This file brings the previously repo-less DEPLOYED endpoint
// under version control — until now /batchVerify existed only as a directly-
// deployed Base44 function with no source in this repo. Deploying this file
// REPLACES the live endpoint and MUST be tested on Base44 first.
//
// It is a thin adapter over the same per-text pipeline verifyBatch runs (same
// schema, same prompt, same InvokeLLM call — an adapter, not a fork), adding
// the MASTER_PLAN v5 §7.3 cost guards the live endpoint lacked: per-plan batch
// caps (free 5, starter 20, everything else 50), a whole-batch credit headroom
// check before any LLM call runs, and per-text billing (N x verifyResponse
// credits, never 1 per request — the 50x metering multiplier is arithmetic).

// Per-plan batch ceilings for THIS endpoint — the docs contract caps a batch at
// 50, so this overrides the smaller shared BATCH_MAX_BY_PLAN defaults. Covers
// every PLAN_QUOTAS plan name; unknown plans fail closed to the free cap.
const BATCH_VERIFY_MAX_BY_PLAN = {
  free: 5,
  starter: 20,
  pro: 50,
  enterprise: 50,
  byok: 50,
  scale: 50,
  premium: 50,
  'api-access': 50,
  'api-access-pro': 50,
};

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
    // Preserve each text's position in texts[] — the documented results carry
    // the original index even when blank entries are dropped.
    const items = (Array.isArray(body.texts) ? body.texts : [])
      .map((t, index) => ({ index, text: String(t || '').trim() }))
      .filter((i) => i.text);
    if (!items.length) return Response.json({ error: 'Provide texts[] (up to 50)' }, { status: 400 });
    // Explicit reject, not silent truncation (MASTER_PLAN v5 §7.3).
    if (items.length > 50) return Response.json({ error: 'Max 50 texts per batch' }, { status: 400 });
    const model = String(body.options?.model || '').trim() || 'gpt_5_mini';

    const auth = await resolveApiKey(svc, req);
    if (!auth.ok) return auth.response;
    const apiKey = auth.apiKey;
    const quota = await checkQuota(svc, apiKey, 'verifyResponse');
    if (!quota.allowed) return Response.json({ error: 'Monthly verification quota exceeded', plan: quota.plan, limit: quota.limit, remaining: 0 }, { status: 429 });
    // Whole-batch headroom (MASTER_PLAN v5 §7.3): this endpoint bills per text,
    // so the whole batch must fit the remaining credits BEFORE any tribunal call
    // runs. A rejected batch runs nothing and charges nothing.
    const charge = planBatchCharge({ plan: quota.plan, remaining: quota.remaining, endpoint: 'verifyResponse', itemCount: items.length, maxBatchByPlan: BATCH_VERIFY_MAX_BY_PLAN });
    if (!charge.allowed) return Response.json({ error: charge.reason, plan: quota.plan, limit: quota.limit, remaining: quota.remaining }, { status: charge.status });

    const results = await Promise.all(items.map(async (it) => {
      const text_preview = it.text.length > 120 ? it.text.slice(0, 120) + '...' : it.text;
      const word_count = it.text.split(/\s+/).filter(Boolean).length;
      try {
        const prompt = `You are the Aether verification engine. Check this AI-generated text for hallucinations. Decompose into claims, judge each supported/unsupported, list corrections, render a verdict (verified/contested/rejected), and assign a calibrated trust score 0-100 (never 100).

TEXT:
"""${it.text}"""

DOMAIN: General
Respond as a single JSON object.`;
        const res = await svc.integrations.Core.InvokeLLM({ prompt, response_json_schema: SCHEMA, model });
        const v = (res && res.data) ? res.data : res;
        const trust = Math.max(0, Math.min(100, Math.round(num(v.trust_score))));
        const verdict = v.verdict || (trust >= 75 ? 'verified' : trust >= 50 ? 'contested' : 'rejected');
        const flags = Array.isArray(v.corrections) ? v.corrections : [];
        return { index: it.index, text_preview, trust_score: trust, verdict, flags, word_count };
      } catch (e) {
        return { index: it.index, text_preview, word_count, error: e?.message || 'failed' };
      }
    }));

    if (apiKey) await recordUsage(svc, apiKey, 'verifyResponse', (CREDIT_COSTS.verifyResponse || 2) * results.length, { batch: results.length, via: 'batchVerify' });

    // Errored items keep their slot in results but are excluded from the verdict
    // counts and the average — a provider failure is not a "rejected" text.
    const scored = results.filter((r) => typeof r.trust_score === 'number');
    const verified = scored.filter((r) => r.verdict === 'verified').length;
    const contested = scored.filter((r) => r.verdict === 'contested').length;
    const rejected = scored.filter((r) => r.verdict === 'rejected').length;
    const average_trust_score = scored.length ? Math.round(scored.reduce((s, r) => s + r.trust_score, 0) / scored.length) : 0;
    const batch_verdict = average_trust_score >= 75 ? 'verified' : average_trust_score >= 50 ? 'contested' : 'rejected';
    return Response.json({ results, summary: { total: results.length, verified, contested, rejected, average_trust_score, batch_verdict } });
  } catch (error) {
    console.error('batchVerify error', error);
    return Response.json({ error: error.message || 'batch failed' }, { status: 500 });
  }
}
