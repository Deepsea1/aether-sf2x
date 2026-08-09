/**
 * Aether MCP Server — Cloudflare Worker (conductor)
 *
 * A thin MCP transport that exposes Aether's real verification engine (the Base44
 * `warrantApi` backend function) to AI clients. This file is the conductor only —
 * the tool logic lives in src/mcp-core.js, auth in src/auth.js, rate limiting in
 * src/ratelimit.js, the OAuth AS/RS in src/oauth.js, and the approval page in
 * src/authorize.js.
 *
 * Two auth paths, both fail-closed, funnelling into the same runMcp():
 *
 *   1. LEGACY STATIC BEARER (preserved unchanged) — mcp-remote clients (.mcpb
 *      Desktop Extension, Claude Code user-scope) POST JSON-RPC to the ROOT `/`
 *      with `Authorization: Bearer <AETHER_MCP_TOKEN>`. Same URL, same header,
 *      same 3 tools, same responses as before.
 *
 *   2. OAUTH 2.1 (additive) — claude.ai custom connectors register `…/mcp` and get
 *      the full discovery + consent handshake via @cloudflare/workers-oauth-provider.
 *
 * The wrapper decides by method + path + headers only — it never reads the body, so
 * whichever handler owns the request reads the JSON-RPC body exactly once.
 */

import { buildProvider } from './src/oauth.js';
import { runMcp, TOOLS } from './src/mcp-core.js';
import { validStaticBearer, staticIdentity } from './src/auth.js';
import { handleAlertsDispatch } from './src/alertsRoute.js';
import { CHANNEL_BUILDERS } from './src/alerts.js';
import { handleCompare } from './src/compareRoute.js';
import { MODEL_REGISTRY, availableModels } from './src/compare.js';

// The OAuthProvider is a pure config object; build it once per isolate, lazily, so
// it can read MCP_PUBLIC_URL from env.
let _provider = null;
function getProvider(env) {
  if (!_provider) _provider = buildProvider(env);
  return _provider;
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const p = url.pathname;

    // Health / discovery — no auth.
    if (req.method === 'GET' && (p === '/' || p === '/health')) {
      const staticConfigured = !!(env.AETHER_MCP_TOKEN || '').trim();
      return Response.json({
        service: 'aether-mcp',
        status: 'ok',
        tools: TOOLS.map((t) => t.name),
        static_auth: staticConfigured,
        auth_required: staticConfigured, // legacy field name, kept for back-compat
        oauth: true,
        warrant_api_configured: !!(env.AETHER_WARRANT_API_URL || '').trim(),
        // Non-MCP capabilities served by this worker.
        alert_channels: Object.keys(CHANNEL_BUILDERS),
        // Honest capability report: which comparison models have a key configured
        // right now, and which are dark. Never claims a model it cannot run.
        compare_models: availableModels(Object.keys(MODEL_REGISTRY), env),
      });
    }

    // LEGACY root MCP endpoint — static bearer ONLY. A plain 401 (no
    // resource_metadata) so legacy clients never spin up OAuth against `/`.
    if (req.method === 'POST' && p === '/') {
      if (await validStaticBearer(req, env)) {
        return runMcp(req, env, ctx, await staticIdentity(req));
      }
      return new Response('Unauthorized', {
        status: 401,
        headers: { 'WWW-Authenticate': 'Bearer' },
      });
    }

    // Real-time hallucination alerting — Slack / Teams. Static bearer only (the same
    // credential as the legacy MCP root); the handler owns its own rate limiting and
    // re-checks the customer-supplied webhook URL against the SSRF guard.
    if (req.method === 'POST' && p === '/alerts/dispatch') {
      return handleAlertsDispatch(req, env);
    }

    // Multi-model diagnostic matrix. Static bearer only. Fans out to PAID vendors, so
    // it runs a model only when that model's own key is configured — with none set it
    // returns 503 and spends nothing.
    if (req.method === 'POST' && p === '/compare') {
      return handleCompare(req, env);
    }

    // A client reconfigured to `/mcp` may still present the static bearer; honor it
    // (static wins), otherwise fall through to the OAuth provider on `/mcp`.
    if (req.method === 'POST' && p === '/mcp' && (await validStaticBearer(req, env))) {
      return runMcp(req, env, ctx, await staticIdentity(req));
    }

    // Everything else → the OAuth provider:
    //   GET /.well-known/oauth-protected-resource[/mcp]  → RFC 9728 PRM
    //   GET /.well-known/oauth-authorization-server      → RFC 8414 AS metadata
    //   GET/POST /authorize                              → defaultHandler (approval)
    //   POST /token, POST /register                      → provider-owned
    //   POST /mcp with a provider-issued Bearer          → validate → mcpApiHandler → runMcp
    //   POST /mcp with no/invalid token                  → 401 + WWW-Authenticate challenge
    return getProvider(env).fetch(req, env, ctx);
  },

  // Defense-in-depth sweep of expired/orphaned OAuth grants + tokens.
  async scheduled(_event, env, _ctx) {
    return getProvider(env).purgeExpiredData(env, { batchSize: 100 });
  },
};
