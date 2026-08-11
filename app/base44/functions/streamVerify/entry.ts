import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveApiKey, checkQuota, recordUsage, CREDIT_COSTS } from '../../shared/apiAuth.js';

// streamVerify — Server-Sent Events endpoint that streams a verification
// verdict progressively: analyzing → per-claim → verdict → done. Same fast
// single-pass tribunal as verifyResponse, but the client receives events as
// they become available so a UI can render the verdict building in real time.

const VERIFY_SCHEMA = {
  type: 'object',
  properties: {
    claims: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          claim: { type: 'string' },
          supported: { type: 'boolean' },
          notes: { type: 'string' },
        },
        required: ['claim', 'supported'],
      },
    },
    corrections: { type: 'array', items: { type: 'string' } },
    verdict: { type: 'string', enum: ['verified', 'contested', 'rejected'] },
    trust_score: { type: 'number' },
    summary: { type: 'string' },
  },
  required: ['claims', 'corrections', 'verdict', 'trust_score'],
};

function num(x) { const n = Number(x); return Number.isFinite(n) ? n : 0; }

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;
    const body = await req.json().catch(() => ({}));
    const text = String(body.text || '').trim();
    if (!text) return Response.json({ error: 'text is required' }, { status: 400 });
    const domain = String(body.domain || 'General');
    const source = String(body.source || 'stream');

    const auth = await resolveApiKey(svc, req);
    if (!auth.ok) return auth.response;
    const apiKey = auth.apiKey;
    const quota = await checkQuota(svc, apiKey, 'verifyResponse');
    if (!quota.allowed) return Response.json({ error: 'Monthly verification quota exceeded' }, { status: 429 });

    const prompt = `You are the Aether verification engine — a fast, impartial tribunal that checks an AI-generated text for hallucinations in real time. Act as proposer, critic, and verifier in a single pass.

TEXT TO VERIFY:
"""${text}"""

DOMAIN: ${domain}

Decompose the text into discrete factual claims, judge each as supported or unsupported, list specific corrections, render a verdict (verified/contested/rejected), and assign a calibrated trust score 0-100 (never 100; ≥90 only for reputation-staking claims). Respond as a single JSON object.`;

    const enc = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (obj) => controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
        send({ stage: 'analyzing' });
        try {
          const t0 = Date.now();
          const res = await svc.integrations.Core.InvokeLLM({ prompt, response_json_schema: VERIFY_SCHEMA, model: 'gpt_5_mini' });
          const v = (res && res.data) ? res.data : res;
          const asArray = (x) => (Array.isArray(x) ? x : []);
          const claims = asArray(v.claims);
          const corrections = asArray(v.corrections);
          const trust_score = Math.max(0, Math.min(100, Math.round(num(v.trust_score))));
          const verdict = v.verdict || (trust_score >= 75 ? 'verified' : trust_score >= 50 ? 'contested' : 'rejected');
          const latency_ms = Date.now() - t0;

          send({ stage: 'claims', count: claims.length });
          for (const c of claims) send({ stage: 'claim', claim: c });

          // Persist the verification.
          // Written via the service-role client so the writes survive strict
          // entity RLS — the sessionless request client only worked while
          // create was forced open (commit 2d7dccd).
          // customer_id: these records are created service-role from an
          // x-api-key call with no Base44 session, so created_by_id is not the
          // caller — customer_id is the only owner attribution these lineages
          // get, and gateApi's side-effect gate reads it.
          const inquiry = await svc.entities.Inquiry.create({
            prompt: text.slice(0, 2000), domain: 'verification', stakes_level: 'medium', status: 'answered',
            customer_id: apiKey.user_id,
            description: `Stream verification · source=${source} · verdict=${verdict} · trust=${trust_score}`,
          });
          const av = await svc.entities.AnswerVersion.create({
            inquiry_id: inquiry.id, version: 1, answer_text: text.slice(0, 4000),
            cognitive_state: { source, verdict, latency_ms, claim_count: claims.length },
            metrics: { support_ratio: claims.length ? claims.filter((c) => c.supported).length / claims.length : 0 },
            trust_score, stakes_level: 'medium',
          });
          const warrant = await svc.entities.Warrant.create({
            answer_version_id: av.id, premises: claims.map((c) => c.claim).slice(0, 20),
            conclusion: (v.summary || text.slice(0, 500)), confidence_score: trust_score / 100,
            validity_status: verdict === 'verified' ? 'valid' : verdict === 'contested' ? 'weak' : 'invalid',
            sources: [], expiry_date: new Date(Date.now() + 30 * 86400000).toISOString(),
            description: `Stream verification · ${verdict} · ${latency_ms}ms`,
          });
          await svc.entities.AnswerVersion.update(av.id, { warrant_id: warrant.id }).catch(() => {});
          if (apiKey) await recordUsage(svc, apiKey, 'verifyResponse', CREDIT_COSTS.verifyResponse || 2, { inquiry_id: inquiry.id });

          send({ stage: 'verdict', trust_score, verdict, corrections, summary: v.summary || '', warrant_id: warrant.id, tribunal_url: `/verify/${av.id}`, latency_ms });
          send({ stage: 'done', tribunal_url: `/verify/${av.id}` });
        } catch (e) {
          send({ stage: 'error', error: e?.message || 'verification failed' });
        }
        controller.close();
      },
    });

    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'Connection': 'keep-alive' },
    });
  } catch (error) {
    console.error('streamVerify error', error);
    return Response.json({ error: error.message || 'stream failed' }, { status: 500 });
  }
}