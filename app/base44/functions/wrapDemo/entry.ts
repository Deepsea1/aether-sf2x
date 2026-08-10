// "Wrap your LLM" demo endpoint for the public API docs page. An evaluating
// developer signs in, pastes a prompt + their model's answer (+ optional
// domain/stakes), and gets back the full attest result AND the governance
// gate decision in one call — so the wrap pattern is tangible before they
// provision an API key. Uses app-user auth (not x-api-key) and is NOT metered;
// production external use goes through the metered warrantApi + gateApi pair.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';
import { attestAnswer } from '../../shared/attest.js';
import { computeTrustworthyRate } from '../../shared/sf2xCore.js';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;
    let user = null;
    try { user = await base44.auth.me(); } catch {}
    if (!user) return Response.json({ error: 'Sign in to run the wrap demo.' }, { status: 401 });

    if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
    const body = await req.json().catch(() => ({}));
    const answerText = String(body.answer_text || '').trim();
    if (!answerText) return Response.json({ error: 'answer_text is required' }, { status: 400 });
    if (answerText.length > 20000) return Response.json({ error: 'answer_text too long (max 20000 chars)' }, { status: 413 });

    const apiKey = { id: 'demo', user_id: user.id, label: user.email || 'demo' };
    const result = await attestAnswer(svc, {
      answerText,
      premises: body.premises,
      sources: body.sources,
      domain: body.domain || 'General',
      stakes: body.stakes || 'medium',
      modelLabel: body.model_label || 'your-model',
      apiKey,
      origin: new URL(req.url).origin,
      signingKey: secrets.get('sf2x_attestation_key'),
    });

    // Governance gate decision (mirrors gateApi logic on the freshly-attested lineage).
    const trust = result.trust_score;
    const stakes = (['low', 'medium', 'high', 'critical'].includes(body.stakes)) ? body.stakes : 'medium';
    const threshold = Number(secrets.get('SF2X_SECURITY_THRESHOLD')) || 60;
    let decision = 'allow', level = 'L1', reason = `Trust ${trust} above threshold ${threshold}`;
    if (result.verdict === 'invalid') { decision = 'suppress'; level = 'L4'; reason = 'Warrant invalid (fabricated/unsupported)'; }
    else if (trust < threshold) { decision = 'suppress'; level = 'L3'; reason = `Trust ${trust} below threshold ${threshold}`; }
    else if (result.verdict === 'weak') { decision = 'escalate'; level = 'L2'; reason = 'Warrant weak — route to review'; }
    else if (stakes === 'critical' && trust < 80) { decision = 'escalate'; level = 'L3'; reason = 'Critical stakes with moderate trust'; }

    return Response.json({
      ...result,
      gate: { decision, gate_level: level, trust_score: trust, warrant_status: result.verdict, stakes, reason, answer_version_id: result.lineage_id },
    });
  } catch (error) {
    console.error('wrapDemo error', error);
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
}