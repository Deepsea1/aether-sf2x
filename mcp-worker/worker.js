/**
 * Aether MCP Server — Cloudflare Worker
 *
 * A thin MCP (Model Context Protocol) transport that exposes Aether's real
 * verification engine (the `warrantApi` Base44 backend function) to AI clients
 * like Claude Desktop, ChatGPT, etc.
 *
 * The Worker does NOT verify claims itself, does NOT sign warrants, and does
 * NOT persist warrants. It calls the Base44 `warrantApi` function which:
 *   - requires the Aether API key (x-api-key header),
 *   - decomposes the text into atomic claims,
 *   - runs the proposer/critic/verifier tribunal,
 *   - signs the warrant with sf2x_attestation_key (secret stays in Base44),
 *   - persists the warrant to the Warrant entity (durable, restart-safe),
 *   - returns warrant_id + lineage_id + signed warrant + red-team certification.
 *
 * The Worker keeps a small KV cache of each verdict (keyed by lineage_id) so
 * explain_verdict / get_warrant can retrieve a prior decision without a second
 * tribunal run. The Warrant entity in Base44 remains the source of truth.
 */

// ───────────────────────────────────────────────────────────────────────────
// Config
// ───────────────────────────────────────────────────────────────────────────

const TOOLS = [
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
// Helpers
// ───────────────────────────────────────────────────────────────────────────

function jsonRpc(id, result) {
  return { jsonrpc: '2.0', id, result };
}
function jsonRpcError(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

// SSRF guard — reject non-http(s) schemes and private/internal hostnames before
// passing source URLs to the upstream verifier.
function isSafeUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { return false; }
  if (u.scheme === 'file:' || u.protocol === 'file:') return false;
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost')) return false;
  if (host === '::1' || host === '[::1]') return false;
  // IPv4 private ranges
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [parseInt(m[1]), parseInt(m[2])];
    if (a === 10) return false;
    if (a === 127) return false;
    if (a === 0) return false;
    if (a === 169 && b === 254) return false; // link-local
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
  }
  return true;
}

// ───────────────────────────────────────────────────────────────────────────
// Auth — bearer token for MCP clients (separate from the Aether API key)
// ───────────────────────────────────────────────────────────────────────────

function checkAuth(req, env) {
  const expected = (env.AETHER_MCP_TOKEN || '').trim();
  if (!expected) return { ok: true }; // dev mode: no token required
  const auth = req.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  return { ok: token === expected };
}

// ───────────────────────────────────────────────────────────────────────────
// Tool handlers
// ───────────────────────────────────────────────────────────────────────────

async function callVerifyClaim(args, env) {
  const text = String(args?.text || '').trim();
  if (!text) throw new Error('text is required');
  const domain = String(args?.domain || 'General');
  const rawSources = Array.isArray(args?.sources) ? args.sources : [];

  // SSRF guard — filter unsafe source URLs up front.
  const safeSources = rawSources
    .filter((s) => s && typeof s === 'object' && typeof s.url === 'string')
    .filter((s) => isSafeUrl(s.url))
    .map((s) => ({ url: s.url, excerpt: String(s.excerpt || '').slice(0, 2000) }));

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
// MCP JSON-RPC dispatcher
// ───────────────────────────────────────────────────────────────────────────

async function handleJsonRpc(req, env) {
  let body;
  try { body = await req.json(); } catch { return jsonRpcError(null, -32700, 'Parse error'); }

  // Batch requests (array) — handle each, return array. (Rare for MCP clients.)
  if (Array.isArray(body)) {
    return { batch: await Promise.all(body.map((b) => dispatchOne(b, env))) };
  }
  return dispatchOne(body, env);
}

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
// Entry
// ───────────────────────────────────────────────────────────────────────────

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    // Health / discovery
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
      return Response.json({
        service: 'aether-mcp',
        status: 'ok',
        tools: TOOLS.map((t) => t.name),
        auth_required: !!(env.AETHER_MCP_TOKEN || '').trim(),
        warrant_api_configured: !!(env.AETHER_WARRANT_API_URL || '').trim(),
      });
    }

    if (req.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    // Auth (bearer token for MCP clients)
    const auth = checkAuth(req, env);
    if (!auth.ok) {
      return new Response('Unauthorized', {
        status: 401,
        headers: { 'WWW-Authenticate': 'Bearer' },
      });
    }

    const rpc = await handleJsonRpc(req, env);

    // Notification acknowledgment — no JSON-RPC body.
    if (rpc && rpc.noId) {
      return new Response(null, { status: 202 });
    }
    // Batch
    if (rpc && rpc.batch) {
      return Response.json(rpc.batch);
    }

    return Response.json(rpc);
  },
};