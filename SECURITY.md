# Security Policy

Aether is a trust product; reports about its own security are treated as first-class work.
This policy covers the whole surface in this repository and the live service.

## Scope

In scope:

- The live app and API at `https://aether.sf2x.com` (verification endpoints, warrants, dashboard)
- The MCP worker (`mcp-worker/` — OAuth 2.1 connector, SSE, batch quota, SSRF guard)
- The GitHub Action (`github-action/`)
- The Python and JavaScript SDKs (`sdk/`)
- The Chrome extension (`chrome-extension/`) and desktop extension (`desktop-extension/`)
- The app source in `app/` (Base44 backend functions and frontend)

Out of scope:

- Volumetric denial-of-service / rate-limit exhaustion without a demonstrated security impact
- Social engineering of maintainers or users
- The underlying third-party platforms themselves (Base44, Cloudflare, GitHub, Stripe) — report those to their own programs
- Findings that require a compromised device or physical access

Especially interesting to us (see `docs/AETHER_MASTER_PLAN_V5.md` §16): prompt injection that
reaches a favorable verdict, SSRF via caller-supplied URLs, cross-tenant access, warrant/signature
integrity issues (canonicalization ambiguity), metering/cost-abuse bypasses, and extension
content-binding bypasses.

## How to report

Preferred: **GitHub private vulnerability reporting** on this repository
(Security tab → "Report a vulnerability").

Alternative: email **cam@sf2x.com** with `[SECURITY]` in the subject. Include: affected component,
reproduction steps, impact, and any proof-of-concept. Please do **not** open a public issue for a
vulnerability.

## What to expect

- Acknowledgement within **72 hours**
- A triage verdict (accepted / needs info / declined, with reasons) within **7 days**
- Status updates at least every **7 days** while a fix is in progress
- Credit in the fix's release notes if you want it (or anonymity if you prefer)
- Confirmed reports produce a regression fixture — your finding permanently joins the test suite

## Coordinated disclosure

Please allow up to **90 days** (or a mutually agreed timeline) before public disclosure. We will
tell you when a fix ships and coordinate the disclosure date with you.

## Safe harbor

Good-faith research within the scope above will not be met with legal action. Good faith means:
no accessing or modifying data that isn't yours (use your own test accounts), no service
degradation for other users, no data exfiltration beyond the minimum proof needed, and giving us
the disclosure window above.

## Bounties

There is no paid bounty program yet (planned — see MASTER_PLAN v5 §29 phase P7). Until then,
reports earn acknowledgement, credit, and our genuine gratitude.

## Supported versions

The live service and the current `main` branch. Older SDK/Action versions receive security fixes
only in their latest release line.
