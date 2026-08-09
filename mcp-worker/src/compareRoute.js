/**
 * POST /compare — the multi-model diagnostic matrix as an endpoint.
 *
 * Same edge discipline as /alerts/dispatch: static bearer, rate limit, input caps,
 * then delegate to the pure engine in compare.js.
 *
 * COST. This is the only route here that fans out to paid third-party vendors, so it
 * is deliberately conservative:
 *   · a model is only ever called when ITS OWN key is configured — with no keys set,
 *     the route returns 503 and spends nothing;
 *   · `max_models` caps the fan-out per request;
 *   · every vendor call is token- and time-capped in modelAdapters.js, with no retries;
 *   · the same rate-limit counters as the MCP tools apply, per caller and per IP.
 *
 * Request:
 *   { "prompt": "...", "models": ["gpt-4o", …], "domain": "Legal",
 *     "format": "json" | "card" | "overlay", "max_models": 4 }
 *
 * Response (json): the full matrix, plus `skipped` naming every model that could not
 * run AND why. A comparison that quietly drops a model would flatter the result.
 */

import { validStaticBearer, staticIdentity } from './auth.js';
import { checkRateLimit } from './ratelimit.js';
import { MODEL_REGISTRY, availableModels, runComparison } from './compare.js';
import { renderDiagnosticCard, renderOverlayHtml } from './compareCard.js';
import { makeGenerate, makeVerify } from './modelAdapters.js';

const MAX_PROMPT_CHARS = 8000;
/** Ceiling on fan-out regardless of what the caller asks for. */
const HARD_MAX_MODELS = 4;

function bad(message, status = 400) {
  return Response.json({ error: message }, { status });
}

export async function handleCompare(req, env, { now = null } = {}) {
  if (!(await validStaticBearer(req, env))) {
    return new Response('Unauthorized', { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } });
  }

  const identity = await staticIdentity(req);
  const rl = await checkRateLimit(env, identity, req.headers.get('CF-Connecting-IP') || '');
  if (rl.limited) {
    return Response.json(
      { error: 'rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter || 60) } },
    );
  }

  const raw = await req.text();
  if (raw.length > MAX_PROMPT_CHARS * 2) return bad('request body too large', 413);

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return bad('request body must be valid JSON');
  }
  if (!body || typeof body !== 'object') return bad('request body must be a JSON object');

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) return bad('prompt is required');
  if (prompt.length > MAX_PROMPT_CHARS) {
    return bad(`prompt exceeds maximum length of ${MAX_PROMPT_CHARS} characters`, 413);
  }

  const format = typeof body.format === 'string' ? body.format.toLowerCase() : 'json';
  if (!['json', 'card', 'overlay'].includes(format)) {
    return bad('format must be one of: json, card, overlay');
  }

  // Which of the requested models can actually run right now.
  const requested = Array.isArray(body.models) ? body.models.filter((m) => typeof m === 'string') : [];
  const { available, unavailable } = availableModels(requested, env);

  const cap = Number.isInteger(body.max_models) && body.max_models > 0
    ? Math.min(body.max_models, HARD_MAX_MODELS)
    : HARD_MAX_MODELS;

  const toRun = available.slice(0, cap);
  const skipped = [
    ...unavailable,
    // Never let a cap silently shrink the comparison — say what was dropped.
    ...available.slice(cap).map((m) => ({ model: m, reason: `exceeded max_models cap of ${cap}` })),
  ];

  if (toRun.length === 0) {
    return Response.json(
      {
        error: 'no comparison models are available',
        detail: 'each model requires its own vendor API key to be configured on this worker',
        skipped,
        configured_models: Object.entries(MODEL_REGISTRY).map(([id, s]) => ({ model: id, requires: s.envKey })),
      },
      { status: 503 },
    );
  }

  if (!String(env.AETHER_WARRANT_API_URL || '').trim()) {
    return Response.json({ error: 'AETHER_WARRANT_API_URL is not configured' }, { status: 503 });
  }

  const domain = typeof body.domain === 'string' && body.domain.trim() ? body.domain.trim() : 'General';

  let matrix;
  try {
    matrix = await runComparison({
      prompt,
      models: toRun,
      generate: makeGenerate(MODEL_REGISTRY, env),
      verify: makeVerify(env, { domain }),
      generatedAt: now,
    });
  } catch (err) {
    return bad(String(err?.message || err), 500);
  }

  matrix.skipped = skipped;

  if (format === 'card') {
    return new Response(renderDiagnosticCard(matrix), {
      headers: { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  if (format === 'overlay') {
    return Response.json({
      prompt: matrix.prompt,
      skipped,
      caveats: matrix.caveats,
      overlays: matrix.rows.map((row) => ({
        model: row.model,
        status: row.status,
        reliability: row.reliability,
        html: row.status === 'ok' ? renderOverlayHtml(row) : null,
        error: row.error,
      })),
    });
  }

  return Response.json(matrix);
}
