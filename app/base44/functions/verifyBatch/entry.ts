import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveApiKey, checkQuota, recordUsage, CREDIT_COSTS } from '../../shared/apiAuth.js';

// verifyBatch — retroactive audit of existing AI transcripts/logs. Accepts up
// to 10 texts (items[] or newline-separated csv) and runs the fast verification
// on each in parallel, returning a per-item verdict + trust score + corrections.
// Larger batches should be chunked client-side.

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
    items = items.slice(0, 10).map((i) => ({ text: String(i.text || '').trim(), domain: String(i.domain || 'General') })).filter((i) => i.text);
    if (!items.length) return Response.json({ error: 'Provide items[] or csv (up to 10)' }, { status: 400 });

    const auth = await resolveApiKey(svc, req);
    if (!auth.ok) return auth.response;
    const apiKey = auth.apiKey;
    const quota = await checkQuota(svc, apiKey, 'verifyResponse');
    if (!quota.allowed) return Response.json({ error: 'Monthly verification quota exceeded', plan: quota.plan, limit: quota.limit, remaining: 0 }, { status: 429 });

    const results = await Promise.all(items.map(async (it) => {
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
        return { text: it.text.slice(0, 200), trust_score: trust, verdict, corrections, issues: corrections.length };
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