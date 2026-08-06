/**
 * MCP core — the tool layer, extracted verbatim from the original single-file
 * worker.js. Tool I/O and upstream warrantApi behavior are UNCHANGED:
 *   - verify_claim  → POST warrantApi { answer_text, domain, sources:[urls], model_label:'mcp' }
 *                     → cache `v:${verification_id}` in KV (30-day TTL) → return the same 7 fields.
 *   - explain_verdict / get_warrant → read the KV cache only.
 *
 * The only deltas vs the original are the folded-in hardening:
 *   - input caps in callVerifyClaim (text ≤ 20 000 chars, sources ≤ 10),
 *   - a rate-limit check for tools/call (in runMcp) before any upstream call,
 *   - isSafeUrl imported from ./ssrf.js.
 *
 * Both entry paths (legacy static bearer and OAuth) funnel into runMcp(); the only
 * difference is the `identity` used for rate limiting.
 */

import { isSafeUrl } from './ssrf.js';
import { checkRateLimit } from './ratelimit.js';

// Input caps (denial-of-wallet / abuse guard).
const MAX_TEXT_CHARS = 20000;
const MAX_SOURCES = 10;
const MAX_EXCERPT_CHARS = 2000;

// ───────────────────────────────────────────────────────────────────────────
// Tool catalog
// ───────────────────────────────────────────────────────────────────────────

export const TOOLS = [
  {
    name: 'verify_claim',
    description:
      'Verify an AI-generated answer for hallucinations. Runs the Aether tribunal ' +
      '(proposer/critic/verifier + red-team) and returns a calibrated trust score, ' +
      'verdict, a cryptographically signed warrant, and a verification id. The warrant ' +
      'is persisted and retrievable later via get_warrant.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The AI-generated answer text to verify.' },
        domain: { type: 'string', description: 'Knowledge domain, e.g. Medicine, Legal, HR, Finance, General.', default: 'General' },
        sources: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              url: { type: 'string', description: 'Source URL (http/https only).' },
              excerpt: { type: 'string', description: 'Optional excerpt from the source.' },
            },
            required: ['url'],
          },
          description: 'Optional supporting or contradicting source URLs to ground the verification.',
        },
      },
      required: ['text'],
    },
  },
  {
    name: 'explain_verdict',
    description:
      'Explain a prior verification decision. Returns the verdict, trust score, and certification ' +
      'status for a given verification id (returned by verify_claim).',
    inputSchema: {
      type: 'object',
      properties: {
        verification_id: { type: 'string', description: 'The verification_id returned by verify_claim.' },
      },
      required: ['verification_id'],
    },
  },
  {
    name: 'get_warrant',
    description:
      'Retrieve the full signed warrant for a prior verification, including the warrant id, ' +
      'lineage id, signature, premises, and expiry. The warrant is the durable proof artifact.',
    inputSchema: {
      type: 'object',
      properties: {
        verification_id: { type: 'string', description: 'The verification_id returned by verify_claim.' },
      },
      required: ['verification_id'],
    },
  },
];

// ───────────────────────────────────────────────────────────────────────────
// JSON-RPC helpers
// ───────────────────────────────────────────────────────────────────────────

function jsonRpc(id, result) {
  return { jsonrpc: '2.0', id, result };
}
function jsonRpcError(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

// ───────────────────────────────────────────────────────────────────────────
// Tool handlers (behavior identical to the original worker.js)
// ───────────────────────────────────────────────────────────────────────────

async function callVerifyClaim(args, env) {
  const text = String(args?.text || '').trim();
  if (!text) throw new Error('text is required');
  // Input cap — reject oversize text before any upstream (paid) call.
  if (text.length > MAX_TEXT_CHARS) {
    throw new Error(`text exceeds maximum length of ${MAX_TEXT_CHARS} characters`);
  }
  const domain = String(args?.domain || 'General');
  // Input cap — never forward more than MAX_SOURCES source URLs upstream.
  const rawSources = Array.isArray(args?.sources) ? args.sources.slice(0, MAX_SOURCES) : [];

  // SSRF guard — filter unsafe source URLs up front.
  const safeSources = rawSources
    .filter((s) => s && typeof s === 'object' && typeof s.url === 'string')
    .filter((s) => isSafeUrl(s.url))
    .map((s) => ({ url: s.url, excerpt: String(s.excerpt || '').slice(0, MAX_EXCERPT_CHARS) }));

  const apiUrl = (env.AETHER_WARRANT_API_URL || '').trim();
  if (!apiUrl) throw new Error('AETHER_WARRANT_API_URL is not configured');

  // Call the real Aether warrantApi. The API key authorizes + meters the call;
  // signing + persistence happen server-side in Base44.
  const upstream = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.AETHER_API_KEY || '',
    },
    body: JSON.stringify({
      answer_text: text,
      domain,
      sources: safeSources.map((s) => s.url),
      model_label: 'mcp',
    }),
  });

  const data = await upstream.json().catch(() => null);
  if (!upstream.ok || !data) {
    throw new Error(`Aether warrantApi error ${upstream.status}: ${JSON.stringify(data?.error || data || 'no response')}`);
  }

  // warrantApi returns: { warrant_id, lineage_id, ...warrant fields, certified, certification, red_team }
  const verification_id = data.lineage_id || data.warrant_id;
  const record = {
    verification_id,
    warrant_id: data.warrant_id || null,
    verdict: data.verdict || (data.trust_score >= 75 ? 'verified' : data.trust_score >= 50 ? 'contested' : 'rejected'),
    trust_score: data.trust_score,
    certified: !!data.certified,
    certification: data.certification || (data.certified ? 'certified' : 'uncertified'),
    signed_hash: data.signed_hash || null,
    premises: data.premises || [],
    sources: safeSources,
    created_at: new Date().toISOString(),
    raw: data,
  };

  // Cache the verdict in KV for explain_verdict / get_warrant (durable, 30-day TTL).
  if (env.WARRANTS && verification_id) {
    try {
      await env.WARRANTS.put(`v:${verification_id}`, JSON.stringify(record), { expirationTtl: 30 * 86400 });
    } catch { /* KV unavailable is non-fatal */ }
  }

  return {
    verification_id,
    warrant_id: record.warrant_id,
    verdict: record.verdict,
    trust_score: record.trust_score,
    certified: record.certified,
    certification: record.certification,
    warrant_signed: !!record.signed_hash,
  };
}

async function callExplainVerdict(args, env) {
  const id = String(args?.verification_id || '').trim();
  if (!id) throw new Error('verification_id is required');
  if (!env.WARRANTS) throw new Error('warrant store unavailable');
  const raw = await env.WARRANTS.get(`v:${id}`);
  if (!raw) throw new Error(`verification ${id} not found (it may have expired or never existed)`);
  const record = JSON.parse(raw);
  return {
    verification_id: record.verification_id,
    warrant_id: record.warrant_id,
    verdict: record.verdict,
    trust_score: record.trust_score,
    certified: record.certified,
    certification: record.certification,
    created_at: record.created_at,
  };
}

async function callGetWarrant(args, env) {
  const id = String(args?.verification_id || '').trim();
  if (!id) throw new Error('verification_id is required');
  if (!env.WARRANTS) throw new Error('warrant store unavailable');
  const raw = await env.WARRANTS.get(`v:${id}`);
  if (!raw) throw new Error(`warrant ${id} not found (it may have expired or never existed)`);
  const record = JSON.parse(raw);
  return {
    verification_id: record.verification_id,
    warrant_id: record.warrant_id,
    verdict: record.verdict,
    trust_score: record.trust_score,
    signed_hash: record.signed_hash,
    premises: record.premises,
    sources: record.sources,
    certified: record.certified,
    certification: record.certification,
    created_at: record.created_at,
    raw_upstream: record.raw,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// JSON-RPC dispatch (per-message; behavior identical to the original)
// ───────────────────────────────────────────────────────────────────────────

async function dispatchOne(msg, env) {
  if (!msg || typeof msg !== 'object') return jsonRpcError(null, -32600, 'Invalid Request');
  const { id, method, params } = msg;

  if (method === 'initialize') {
    return jsonRpc(id, {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'aether', version: '1.0.0' },
    });
  }
  if (method === 'notifications/initialized') {
    // Notification (no id) — acknowledge; caller will treat as 202.
    return { accepted: true, noId: true };
  }
  if (method === 'tools/list') {
    return jsonRpc(id, { tools: TOOLS });
  }
  if (method === 'tools/call') {
    const name = params?.name;
    const args = params?.arguments || {};
    try {
      let result;
      if (name === 'verify_claim') result = await callVerifyClaim(args, env);
      else if (name === 'explain_verdict') result = await callExplainVerdict(args, env);
      else if (name === 'get_warrant') result = await callGetWarrant(args, env);
      else return jsonRpcError(id, -32601, `Unknown tool: ${name}`);

      return jsonRpc(id, {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      });
    } catch (err) {
      return jsonRpc(id, {
        content: [{ type: 'text', text: JSON.stringify({ error: err.message || 'tool failed' }) }],
        isError: true,
      });
    }
  }

  return jsonRpcError(id, -32601, `Unknown method: ${method}`);
}

// ───────────────────────────────────────────────────────────────────────────
// runMcp — the single funnel for BOTH the static-bearer path and the OAuth path.
// Reads the JSON-RPC body exactly once, rate-limits tools/call, and dispatches.
// `identity` is the rate-limit key (static-token hash, or the OAuth userId).
// ───────────────────────────────────────────────────────────────────────────

export async function runMcp(req, env, ctx, identity, opts = {}) {
  const ip = req.headers.get('cf-connecting-ip') || 'noip';

  let body;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(jsonRpcError(null, -32700, 'Parse error'));
  }

  const messages = Array.isArray(body) ? body : [body];

  // Denial-of-wallet guard: any request that would execute a tool call is
  // rate-limited before we dispatch (and thus before any paid upstream call).
  const hasToolCall = messages.some((m) => m && m.method === 'tools/call');
  if (hasToolCall) {
    const rl = await checkRateLimit(env, identity, ip);
    if (rl.limited) {
      const id = messages.length === 1 ? (messages[0]?.id ?? null) : null;
      return jsonResponse(
        jsonRpcError(id, -32029, `Rate limit exceeded. Retry after ${rl.retryAfter}s.`),
        429,
        { 'Retry-After': String(rl.retryAfter) }
      );
    }
  }

  // Streamable-HTTP clients (the claude.ai OAuth connector) accept text/event-stream
  // and will cut a slow single-shot JSON response mid-flight. When the caller opts
  // into SSE, stream the reply with periodic heartbeats so the multi-second tribunal
  // call stays alive to completion. The legacy bearer path leaves opts.sse unset →
  // unchanged single-JSON response, so the .mcpb / Claude Code clients are untouched.
  if (opts.sse && !Array.isArray(body)) {
    return sseResponse(async (send) => {
      const rpc = await dispatchOne(body, env);
      if (rpc && !rpc.noId) send(rpc);
    });
  }

  // Batch requests (array) — handle each, return an array. (Rare for MCP clients.)
  if (Array.isArray(body)) {
    const out = await Promise.all(body.map((b) => dispatchOne(b, env)));
    return jsonResponse(out);
  }

  const rpc = await dispatchOne(body, env);
  // Notification acknowledgment — no JSON-RPC body.
  if (rpc && rpc.noId) {
    return new Response(null, { status: 202 });
  }
  return jsonResponse(rpc);
}

function jsonResponse(obj, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}

// SSE response for MCP Streamable-HTTP clients that can idle-close a slow single
// JSON reply. Opens the stream immediately, heartbeats every 5s while the tool
// runs, then emits the JSON-RPC result as one `message` event and closes. Runs
// fire-and-forget: the Workers runtime keeps the isolate alive while the response
// body stream is open, so no waitUntil is required.
function sseResponse(produce) {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const enc = new TextEncoder();
  const raw = (s) => writer.write(enc.encode(s)).catch(() => {});
  const send = (obj) => raw(`event: message\ndata: ${JSON.stringify(obj)}\n\n`);
  (async () => {
    raw(': open\n\n'); // flush headers right away so the client never idle-closes
    let done = false;
    (async () => {
      while (!done) {
        await new Promise((r) => setTimeout(r, 5000));
        if (!done) raw(': keep-alive\n\n');
      }
    })();
    try {
      await produce(send);
    } catch {
      send(jsonRpcError(null, -32603, 'internal error'));
    } finally {
      done = true;
      await writer.close().catch(() => {});
    }
  })();
  return new Response(readable, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

// ───────────────────────────────────────────────────────────────────────────
// mcpApiHandler — the OAuth-protected handler the provider mounts at apiRoute.
// The provider validates the OAuth token and injects ctx.props before calling us.
// ───────────────────────────────────────────────────────────────────────────

export const mcpApiHandler = {
  async fetch(request, env, ctx) {
    const userId = ctx && ctx.props && ctx.props.userId ? String(ctx.props.userId) : 'owner';
    return runMcp(request, env, ctx, `oauth:${userId}`, { sse: true });
  },
};
