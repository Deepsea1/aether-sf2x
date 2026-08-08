import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';
import { resolveApiKey, checkQuota, recordUsage, CREDIT_COSTS } from '../../shared/apiAuth.js';
import { attestAnswer } from '../../shared/attest.js';

// Batch Warrant API — attest up to 25 answers in one call. Each item is attested
// independently; per-item successes and failures are returned in order.

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;
    const body = await req.json().catch(() => ({}));
    const auth = await resolveApiKey(svc, req);
    if (!auth.ok) return auth.response;
    const apiKey = auth.apiKey;
    const answers = Array.isArray(body.answers) ? body.answers : [];
    if (!answers.length) return Response.json({ error: 'answers[] is required' }, { status: 400 });
    if (answers.length > 25) return Response.json({ error: 'Max 25 answers per batch' }, { status: 413 });

    // Metering parity with warrantApi. Each item runs the identical attestAnswer
    // work, so a batch is priced per item at the same rate. Gate on the same
    // remaining>0 rule warrantApi uses (not remaining>=cost) so a customer with
    // credits left is never blocked mid-batch — a batch may overshoot the quota
    // once, exactly as a single warrantApi call already can.
    const quota = await checkQuota(svc, apiKey, 'batchWarrant');
    if (!quota.allowed) return Response.json({ error: 'Monthly credit quota exceeded', plan: quota.plan, limit: quota.limit, used: quota.used, remaining: 0 }, { status: 429 });

    const origin = new URL(req.url).origin;
    const signatureKeys = { ed25519PrivateKey: secrets.get('ED25519_PRIVATE_KEY'), hmacKey: secrets.get('sf2x_attestation_key') };
    const results = [];
    for (const a of answers) {
      try {
        const r = await attestAnswer(svc, {
          answerText: a.answer_text,
          premises: a.premises,
          sources: a.sources,
          domain: a.domain,
          stakes: a.stakes,
          modelLabel: a.model_label,
          apiKey, origin, signatureKeys,
        });
        results.push({ ok: true, ...r });
      } catch (e) {
        results.push({ ok: false, error: e.message });
      }
    }
    // Charge only for items that actually attested — mirrors warrantApi, where
    // recordUsage runs after the work succeeds so failed calls are not billed.
    // One ApiUsage row for the whole batch rather than up to 25.
    const succeeded = results.filter((r) => r.ok).length;
    if (succeeded > 0) {
      await recordUsage(svc, apiKey, 'batchWarrant', succeeded * CREDIT_COSTS.batchWarrant, {
        items: answers.length, succeeded, failed: results.length - succeeded,
      });
    }
    return Response.json({ count: results.length, succeeded, results });
  } catch (error) {
    console.error('batchWarrant error', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}