# Aether MCP Server (Cloudflare Worker)

A thin MCP server that lets Claude (and other AI clients) call Aether's real
verification engine. No Express, no Redis — just one Cloudflare Worker + KV.

## What it does

- Exposes 3 MCP tools: `verify_claim`, `explain_verdict`, `get_warrant`
- `verify_claim` calls your Aether `warrantApi` backend function, which runs the
  tribunal, **signs the warrant** with `sf2x_attestation_key`, and **persists it
  to the `Warrant` entity** in Base44.
- The Worker keeps a small KV cache of each verdict so `explain_verdict` and
  `get_warrant` can retrieve prior decisions without a second tribunal run.
- The attestation key never leaves Base44; the Worker never signs anything itself.

## Deploy (5 steps)

1. **Create the KV namespace**
   ```
   cd mcp-worker
   npx wrangler kv namespace create WARRANTS
   ```
   Copy the `id` it prints into `wrangler.toml` (replace `REPLACE_WITH_KV_NAMESPACE_ID`).

2. **Set the warrantApi URL** in `wrangler.toml` under `[vars]`.
   This is your Base44 app's `warrantApi` function endpoint. Find it in the
   Base44 dashboard (Functions → warrantApi → endpoint URL), or use your app's
   published domain. It looks like:
   ```
   https://YOUR-APP.base44.app/api/functions/warrantApi
   ```

3. **Set the two secrets** (never commit these):
   ```
   npx wrangler secret put AETHER_API_KEY      # your SF2X_API_KEY value
   npx wrangler secret put AETHER_MCP_TOKEN    # a long random string (the password Claude uses)
   ```
   - `AETHER_API_KEY` = the Aether API key that authorizes the upstream call.
   - `AETHER_MCP_TOKEN` = the bearer token MCP clients send to authenticate to
     the Worker. Pick any long random string. (Leave unset for open dev mode.)

4. **Deploy**
   ```
   npx wrangler deploy
   ```
   You'll get a public URL like `https://aether-mcp.<your-subdomain>.workers.dev`.

5. **Connect Claude**
   In Claude Desktop's config (`claude_desktop_config.json`), add:
   ```json
   {
     "mcpServers": {
       "aether": {
         "url": "https://aether-mcp.<your-subdomain>.workers.dev",
         "headers": { "Authorization": "Bearer YOUR_AETHER_MCP_TOKEN" }
       }
     }
   }
   ```
   Restart Claude. You'll see the `verify_claim`, `explain_verdict`, and
   `get_warrant` tools available.

## Test it

```
curl https://aether-mcp.<your-subdomain>.workers.dev/health
curl -X POST https://aether-mcp.<your-subdomain>.workers.dev \
  -H "Authorization: Bearer YOUR_AETHER_MCP_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## Notes

- Quota / rate limiting is enforced by the upstream Aether `warrantApi` (per API
  key), so the Worker itself doesn't need its own limiter.
- Warrants are the durable source of truth in the Base44 `Warrant` entity. The
  KV cache is just for fast retrieval of the verdict summary; if it expires
  (30-day TTL) the warrant is still in Base44.
- SSRF guard: source URLs are validated to http/https and non-private ranges
  before being passed upstream.