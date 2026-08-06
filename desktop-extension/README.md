# Aether Verify — Desktop Extension (.mcpb)

A one-click [Desktop Extension](https://www.anthropic.com/engineering/desktop-extensions) (`.mcpb`) that adds the Aether verification tools — `verify_claim`, `explain_verdict`, `get_warrant` — to a compatible Claude Desktop build, without editing any config file by hand.

It wraps the [`mcp-remote`](https://www.npmjs.com/package/mcp-remote) bridge, which connects over StreamableHTTP to the live `aether-mcp` Cloudflare Worker. Pairs with [`../mcp-worker`](../mcp-worker) (the server) and [`../claude-skill`](../claude-skill) (the skill that teaches Claude when to use the tools).

## Auth — the token is never in the bundle

The worker requires a bearer token. This extension takes it as a **`sensitive`, required** `user_config` field (`auth_header` in [manifest.json](manifest.json)) that Claude prompts for at install time and stores in the OS keychain — it is **never** baked into the `.mcpb`, so the packed artifact is safe to distribute publicly. At runtime `mcp-remote` sends it as `Authorization: <value>`.

## Build

```bash
npm install
npx @anthropic-ai/mcpb pack
```

That produces `aether-verify.mcpb` (git-ignored here — attach it to a GitHub Release rather than committing the binary). `node_modules/` and the packed `.mcpb` are gitignored; `test-bridge.js` and `package-lock.json` are excluded from the bundle via [.mcpbignore](.mcpbignore).

## Install

1. In Claude Desktop → **Settings → Extensions → Install** and choose the `aether-verify.mcpb` file.
2. When prompted for **"Aether auth header value,"** paste the exact header value (the `Authorization` value for the worker). Copy it from `mcp-worker/.env.local` — do not paste it into a chat.
3. The `verify_claim` / `explain_verdict` / `get_warrant` tools appear.

> Availability note: not every Claude build exposes the Extensions install UI. If yours doesn't, use the worker's OAuth/claude.ai-connector route instead; this `.mcpb` remains the install path for builds that do.

## Verify

`test-bridge.js` spawns the exact command line the manifest declares and runs a real MCP `initialize` + `tools/list` against the live worker, masking all secret output. It reads the token from your local Claude Code user scope for the check only:

```bash
node test-bridge.js
```

Expected: `VERDICT: PASS` with `TOOLS: verify_claim, explain_verdict, get_warrant`.
