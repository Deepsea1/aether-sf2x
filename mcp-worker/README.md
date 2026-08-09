# Aether MCP Server (Cloudflare Worker)

A thin MCP server that lets Claude (and other AI clients) call Aether's real
verification engine. No Express, no Redis — just one Cloudflare Worker + KV.

It supports **two authentication paths at the same time**:

1. **Static bearer (legacy, preserved)** — `mcp-remote` clients (the `.mcpb`
   Desktop Extension, Claude Code user-scope registration) POST JSON-RPC to the
   **root `/`** with `Authorization: Bearer <AETHER_MCP_TOKEN>`. Unchanged.
2. **OAuth 2.1 remote connector (additive)** — claude.ai custom connectors
   register **`…/mcp`** and get the full discovery + consent handshake, powered by
   [`@cloudflare/workers-oauth-provider`](https://github.com/cloudflare/workers-oauth-provider).

Both paths funnel into the same three tools and the same upstream engine.

## What it does

- Exposes 3 MCP tools: `verify_claim`, `explain_verdict`, `get_warrant`.
- `verify_claim` calls your Aether `warrantApi` backend function, which runs the
  tribunal, **signs the warrant** with `sf2x_attestation_key`, and **persists it
  to the `Warrant` entity** in Base44.
- The Worker keeps a small KV cache of each verdict so `explain_verdict` and
  `get_warrant` can retrieve prior decisions without a second tribunal run.
- The attestation key never leaves Base44; the Worker never signs anything itself.

It also serves two non-MCP HTTP endpoints, both behind the same static bearer:

- **`POST /alerts/dispatch`** — real-time hallucination alerting to Slack / Microsoft
  Teams. Evaluates a trigger policy against a verification and, only if it fires,
  formats and delivers a card. Full reference: [`docs/INTEGRATION_GUIDE.md`](../docs/INTEGRATION_GUIDE.md).
- **`POST /compare`** — the multi-model diagnostic matrix (below).

`GET /health` reports both capabilities honestly, including which comparison models
have a key configured and which are dark.

## `POST /compare` — multi-model diagnostic matrix

Sends one prompt to several frontier models, runs **every** answer through the Aether
tribunal, and returns a sentence-by-sentence map of where each model held up.

```bash
curl -X POST https://aether-mcp.campiper84.workers.dev/compare \
  -H "Authorization: Bearer $AETHER_MCP_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "prompt": "How many vacation days do first-year employees get?",
        "models": ["gpt-4o", "claude-sonnet-4.5"],
        "domain": "HR", "format": "json" }'
```

| Field | Default | Notes |
|---|---|---|
| `prompt` | — | Required, ≤ 8000 chars |
| `models` | all registered | Only models with a configured key actually run |
| `domain` | `General` | Passed to the tribunal |
| `format` | `json` | `json` · `card` (SVG) · `overlay` (HTML per model) |
| `max_models` | `4` | Fan-out cap; the hard ceiling is also 4 |

### The colour scale has four states, not three

| State | Colour | Meaning |
|---|---|---|
| `verified` | green | A supported claim maps to this sentence |
| `unsupported` | red | The tribunal could not support this sentence |
| `unassessed` | **grey** | The tribunal never assessed it — **this is not a pass** |

Grey is the **default**, and it exists because most sentences in a real answer are
never individually assessed. Colouring them green would turn silence into a
verification claim, which is precisely the failure Aether exists to catch. Claim→
sentence mapping is a declared heuristic (normalized containment, then token overlap
at ≥ 0.5); every mapped sentence carries `matchMethod` and `matchConfidence`, and any
claim that maps nowhere is returned in `unmappedClaims` rather than dropped.

`reliability` is the tribunal's **own** trust score, passed through untouched — not a
composite invented here. A model whose verification carried no score reports
`reliability: null` with `reliabilityBasis` explaining why, and a tie in the ranking is
reported as a tie rather than broken arbitrarily.

### Cost

This is the only endpoint that calls paid third-party vendors, so it is deliberately
conservative:

- A model runs **only** when its own key is set — `OPENAI_API_KEY`,
  `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `GROQ_API_KEY` (Llama via Groq's
  OpenAI-compatible endpoint). With none configured the route returns **503 and spends
  nothing**.
- Output is capped at 600 tokens per vendor call, each with a 30s timeout and **no
  retries** — a retry loop across four vendors is an easy way to multiply a bill.
- The same per-caller and per-IP rate-limit counters as the MCP tools apply.
- Anything not run is listed in `skipped` **with the reason**, including models dropped
  by the `max_models` cap. A comparison never quietly shrinks.

## Architecture (files)

`worker.js` is the conductor only; the logic is split into modules:

| File | Purpose |
|---|---|
| `worker.js` | Thin entry: health, static-bearer short-circuit at `/` and `/mcp`, delegation to the OAuth provider, `scheduled()` KV purge. |
| `src/mcp-core.js` | The 3 tools + JSON-RPC dispatch + `runMcp()` (the single funnel) + `mcpApiHandler` (the OAuth-protected handler). Tool I/O unchanged. |
| `src/oauth.js` | Builds the configured `OAuthProvider` (AS/RS: PRM, AS metadata, `/authorize`, `/token`, S256 PKCE, CIMD). |
| `src/authorize.js` | The `/authorize` approval page, gated by a shared secret. |
| `src/auth.js` | Static-bearer validation (fail-closed) + constant-time compare. |
| `src/ratelimit.js` | Per-identity + per-IP KV rate limiter (denial-of-wallet guard). |
| `src/ssrf.js` | Source-URL SSRF guard (also guards customer-supplied alert webhooks). |
| `src/alerts.js` | Pure alerting layer: normalize any verification shape, evaluate the trigger policy, build Slack Block Kit / Teams MessageCard payloads. `dispatchAlert` is the only I/O. |
| `src/alertsRoute.js` | `POST /alerts/dispatch` — auth, rate limit, input caps, then delegate. |
| `src/compare.js` | Pure diagnostic-matrix engine: sentence segmentation, claim→sentence mapping, per-model rows, ranking. |
| `src/compareCard.js` | SVG diagnostic card + HTML sentence overlay (no dependencies, Worker-safe). |
| `src/modelAdapters.js` | One fetch per vendor (OpenAI / Anthropic / Google / Groq), token- and time-capped, no retries. |
| `src/compareRoute.js` | `POST /compare` — auth, rate limit, key gating, then delegate. |

## Deploy

Run everything from `mcp-worker/`.

1. **Install deps** (pulls the OAuth provider, generates `package-lock.json`):
   ```
   npm install
   ```

2. **Create the three KV namespaces** and paste each printed `id` into the
   matching binding in `wrangler.toml`:
   ```
   npx wrangler kv namespace create WARRANTS     # verdict cache (already set)
   npx wrangler kv namespace create OAUTH_KV     # OAuth grants/tokens — binding name MUST be OAUTH_KV
   npx wrangler kv namespace create RL_KV        # rate-limit + /authorize brute-force counters
   ```
   > `OAUTH_KV` is looked up by that literal binding name by the provider — do not
   > rename it. `RL_KV` is optional; if absent the limiter falls back to the
   > `WARRANTS` namespace with an `rl:` key prefix.

3. **Set the `warrantApi` URL** in `wrangler.toml` under `[vars]`
   (`AETHER_WARRANT_API_URL`). Already set to `https://aether.sf2x.com/api/functions/warrantApi`.

4. **Set the secrets** (never commit these):
   ```
   npx wrangler secret put AETHER_API_KEY        # active sk_sf2x_… key (authorizes the upstream call)
   npx wrangler secret put AETHER_MCP_TOKEN      # long random string — the static bearer legacy clients present
   npx wrangler secret put AETHER_OAUTH_SECRET   # long random string — the shared secret gating the /authorize approval page
   ```
   - `AETHER_MCP_TOKEN` — **required** for the static path (if unset, the Worker
     fails closed and rejects the static path; there is no open dev mode in prod).
   - `AETHER_OAUTH_SECRET` — **required** for the OAuth path; without it the
     `/authorize` page disables approval (fail closed).

5. **Validate, then deploy**:
   ```
   npx wrangler deploy --dry-run    # bundles + validates without deploying
   npx wrangler deploy              # deploys to aether-mcp.<subdomain>.workers.dev
   ```

## Connect a client

### Static (legacy `mcp-remote` / Desktop Extension / Claude Code)

Point at the **root origin** with a static bearer (unchanged):
```json
{
  "mcpServers": {
    "aether": {
      "url": "https://aether-mcp.<subdomain>.workers.dev",
      "headers": { "Authorization": "Bearer YOUR_AETHER_MCP_TOKEN" }
    }
  }
}
```

### OAuth remote connector (claude.ai)

Settings → Connectors → **Add custom connector** → URL:
```
https://aether-mcp.<subdomain>.workers.dev/mcp
```
Register the **`/mcp`** path (not the bare origin) so the OAuth audience binding
lines up. claude.ai will open the `/authorize` page; enter the
`AETHER_OAUTH_SECRET` to approve, and the 3 tools appear.

## Test it

```
curl https://aether-mcp.<subdomain>.workers.dev/health

# static path (root):
curl -X POST https://aether-mcp.<subdomain>.workers.dev/ \
  -H "Authorization: Bearer YOUR_AETHER_MCP_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# OAuth discovery (no token needed):
curl https://aether-mcp.<subdomain>.workers.dev/.well-known/oauth-protected-resource/mcp
curl https://aether-mcp.<subdomain>.workers.dev/.well-known/oauth-authorization-server

# unauthenticated /mcp returns the discovery challenge:
curl -i -X POST https://aether-mcp.<subdomain>.workers.dev/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'   # → 401 + WWW-Authenticate: … resource_metadata=…
```

## Security notes

- **Fail closed.** Every tool-executing path requires either a valid static bearer
  or a provider-validated OAuth token. There is no fail-open dev path in prod (a
  local-only `ALLOW_INSECURE=true` escape hatch exists for `wrangler dev` and must
  never be set in production).
- **Rate limiting (denial-of-wallet guard).** `tools/call` is rate-limited per
  identity **and** per IP, per-minute + per-day, via KV counters (`RL_PER_MIN` /
  `RL_PER_DAY`, default 20/min, 200/day), returning `429` + `Retry-After` before
  any paid upstream call. KV is eventually consistent, so this is a best-effort
  backstop against sustained abuse, not a precise limiter. (The upstream
  `warrantApi` still enforces its own per-key quota.)
- **Input caps.** `verify_claim` rejects `text` longer than 20 000 chars before any
  upstream call and forwards at most 10 source URLs (excerpts truncated to 2 000
  chars and never sent upstream — only URLs are).
- **Constant-time secret compare.** Both the static bearer and the
  `AETHER_OAUTH_SECRET` are compared via SHA-256 digest + fixed-length XOR, so
  neither the value nor its length leaks by timing.
- **SSRF guard.** Source URLs are validated to http/https and non-private ranges
  before being passed upstream.
- **CIMD.** Client ID Metadata Documents are enabled; the `global_fetch_strictly_public`
  compatibility flag hardens the outbound metadata fetch against SSRF.
- **Warrants** are the durable source of truth in the Base44 `Warrant` entity. The
  KV cache is only a 30-day verdict cache; if it expires the warrant is still in Base44.

## Future upgrades (noted, not built)

- **Google-SSO delegation** — replace the shared-secret check in `src/authorize.js`
  with an OIDC redirect, keeping the same `completeAuthorization()` tail.
- **Lazy auth** — make `initialize`/`tools/list` public and 401 only on `tools/call`,
  if a pre-sign-in tool preview is ever wanted.
