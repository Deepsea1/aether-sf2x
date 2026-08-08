import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { requireAdmin } from '../../shared/auth.js';
import { buildThinkPrompt, THINK_JSON_SCHEMA, computeTrustworthyRate } from '../../shared/sf2xCore.js';
import { ALL_MODELS, VERDICT_SCHEMA, buildVerifierPrompt, buildQuestionOfDayPrompt } from '../../shared/sf2xBench.js';
import { callOpenRouter } from '../../shared/openrouter.js';
import { emitTelemetry, newTraceId } from '../../shared/telemetry.js';

const MODEL_MAP = new Map(ALL_MODELS.map((m) => [m.value, m]));

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;
    const body = await req.json().catch(() => ({}));
    const _auth = await requireAdmin(base44);
    if (!_auth.ok) return _auth.response;

    let question = (body.question || '').toString().trim();
    const runType = body.run_type === 'daily' ? 'daily' : 'manual';
    const requested = Array.isArray(body.models) && body.models.length
      ? body.models.filter((m) => MODEL_MAP.has(m))
      : ALL_MODELS.map((m) => m.value);

    if (!question) {
      const qRes = await svc.integrations.Core.InvokeLLM({
        prompt: buildQuestionOfDayPrompt(),
        response_json_schema: { type: 'object', properties: { question: { type: 'string' } }, required: ['question'] },
        model: 'gemini_3_flash',
        add_context_from_internet: true,
      });
      const qd = qRes && qRes.data ? qRes.data : qRes;
      question = (qd.question || '').toString().trim();
    }
    if (!question) return Response.json({ error: 'Could not determine a question' }, { status: 400 });

    const dateStr = new Date().toISOString().slice(0, 10);
    const traceId = newTraceId();
    await emitTelemetry(svc, {
      trace_id: traceId,
      event_type: 'request_received',
      span_type: 'operation',
      group: 'identity',
      identity: { role: 'admin', plan: 'admin', client_type: runType === 'daily' ? 'workflow' : 'ui', auth_state: 'internal_token' },
      summary: `Model arena run (${runType}) — ${requested.length} models`,
    });

    const settled = await Promise.allSettled(requested.map(async (m) => {
      const t0 = Date.now();
      const entry = MODEL_MAP.get(m);
      const thinkPrompt = buildThinkPrompt(question, 'General', 'high');
      let r;
      if (entry?.openrouter) {
        r = await callOpenRouter(thinkPrompt, entry.or_model);
      } else {
        const params = { prompt: thinkPrompt, response_json_schema: THINK_JSON_SCHEMA };
        if (m !== 'automatic') params.model = m;
        const res = await svc.integrations.Core.InvokeLLM(params);
        r = res && res.data ? res.data : res;
      }
      const trust = computeTrustworthyRate(r.metrics || {}, r.warrant || {});
      const latency = Date.now() - t0;
      await emitTelemetry(svc, {
        trace_id: traceId,
        event_type: r.answer ? 'model_completed' : 'model_failed',
        span_type: 'model_call',
        group: 'model',
        linked_entity_type: 'ModelBenchRun',
        model: { provider: entry?.tag || 'Base44', name: m, version: entry?.label || m, endpoint: entry?.openrouter ? 'openrouter' : 'core_invoke_llm', cache_hit: null, latency_ms: latency },
        performance: { latency_ms: latency, token_count: null, cost_usd: null, error: r.answer ? null : 'no answer' },
        summary: `${entry?.label || m} arena run · trust=${trust.toFixed(0)}`,
      });
      return {
        model: m,
        label: MODEL_MAP.get(m)?.label || m,
        answer: r.answer || '',
        warrant: r.warrant || {},
        metrics: r.metrics || {},
        trust,
        latency_ms: latency,
      };
    }));

    const runs = settled.map((s, i) => {
      const m = requested[i];
      const base = { id: 'm' + i, model: m, label: MODEL_MAP.get(m)?.label || m };
      if (s.status === 'fulfilled') return { ...base, ...s.value };
      return { ...base, answer: '', warrant: {}, metrics: {}, trust: 0, latency_ms: 0, error: s.reason?.message || 'failed' };
    });

    let verdicts = {};
    let winnerIds = [];
    const answerable = runs.filter((o) => !o.error && o.answer);
    if (answerable.length) {
      const candidates = answerable.map(({ id, label, answer }) => ({ id, model: label, answer }));
      // Verifiers sometimes echo the model label instead of the candidate id; normalize both ways.
      const knownIds = new Set(answerable.map((o) => o.id));
      const idByLabel = new Map(answerable.map((o) => [String(o.label).toLowerCase(), o.id]));
      const resolveId = (raw) => {
        if (raw && knownIds.has(raw)) return raw;
        return idByLabel.get(String(raw || '').toLowerCase()) || null;
      };
      for (const verifierModel of ['claude_opus_4_8', 'claude_sonnet_4_6', 'automatic']) {
        try {
          const vRes = await svc.integrations.Core.InvokeLLM({
            prompt: buildVerifierPrompt(question, candidates),
            response_json_schema: VERDICT_SCHEMA,
            model: verifierModel,
          });
          const vd = vRes && vRes.data ? vRes.data : vRes;
          const rankings = Array.isArray(vd.rankings) ? vd.rankings : [];
          if (!rankings.length) throw new Error('empty rankings');
          rankings.forEach((r) => {
            const rid = resolveId(r.id || r.model);
            if (rid) verdicts[rid] = { correctness: Math.max(0, Math.min(1, Number(r.correctness) || 0)), notes: r.notes || '' };
          });
          winnerIds = (Array.isArray(vd.winner_ids) ? vd.winner_ids : [])
            .map(resolveId)
            .filter((wid) => wid && knownIds.has(wid));
          break;
        } catch (e) {
          console.error('runModelBench verifier ' + verifierModel + ' failed', e?.message || e);
        }
      }
    }

    const saved = [];
    for (const o of runs) {
      const v = verdicts[o.id] || {};
      const rec = await svc.entities.ModelBenchRun.create({
        question,
        question_date: dateStr,
        model: o.model,
        model_label: o.label,
        answer_text: o.answer,
        trust_score: o.trust,
        correctness: v.correctness ?? null,
        is_winner: winnerIds.includes(o.id),
        metrics: o.metrics,
        warrant_summary: {
          validity: o.warrant?.validity_status || null,
          confidence: o.warrant?.confidence_score ?? null,
          premises: (o.warrant?.premises || []).length,
          sources: (o.warrant?.sources || []).length,
        },
        latency_ms: o.latency_ms,
        run_type: runType,
        verifier_notes: v.notes || '',
        error: o.error || null,
      });
      saved.push({
        id: rec.id,
        model: o.model,
        label: o.label,
        trust: o.trust,
        correctness: v.correctness ?? null,
        is_winner: rec.is_winner,
        answer: o.answer,
        warrant: o.warrant,
        metrics: o.metrics,
        latency_ms: o.latency_ms,
        verifier_notes: v.notes || '',
        error: o.error || null,
      });
    }

    await svc.entities.AuditLog.create({
      event_type: 'answer_promoted',
      entity_type: 'ModelBenchRun',
      entity_id: saved[0]?.id || '',
      summary: `Model arena run (${runType}) — ${runs.length} models on: ${question.slice(0, 80)}`,
      metadata: { run_type: runType, models: runs.length, question_date: dateStr },
    }).catch(() => {});

    saved.sort((a, b) => (b.correctness ?? -1) - (a.correctness ?? -1) || b.trust - a.trust);
    return Response.json({ question, question_date: dateStr, run_type: runType, runs: saved });
  } catch (error) {
    console.error('runModelBench error', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}