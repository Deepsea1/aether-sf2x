---
name: aether-verify
description: >-
  Verify AI-generated answers and catch hallucinations with the Aether MCP
  tools, which proxy a claim to an upstream tribunal that decomposes it,
  cross-examines it (proposer/critic/verifier + red-team), scores trust, and
  returns a cryptographically signed warrant. Use whenever the user wants to
  fact-check, verify, trust-check, validate, confirm, corroborate, vet, or
  audit an AI answer, claim, statement, citation, quote, figure, or response
  before relying on it; guard against hallucination, fabrication,
  confabulation, or made-up facts; get a trust score, verdict, certification,
  or signed warrant / attestation / proof / receipt; or re-explain or fetch the
  full proof of a prior check by its verification_id. Fires on: verify, verify
  this, verify the answer, verify the claim, verification, reverify, fact-check,
  fact check, factcheck, check the facts, check this, check that, double-check,
  double check, triple-check, cross-check, cross-reference, sanity-check, sanity
  check, gut-check, reality-check, spot-check, validate, validation, confirm,
  confirm this, corroborate, substantiate, verify accuracy, vet, vet this, vet
  the claim, audit, audit this, audit this claim, review this claim, scrutinize,
  interrogate the claim; trust score, trustworthy, trustworthiness, trust
  check, trust-check, how trustworthy, can I trust this, should I trust this, do
  I trust this, is this reliable, reliability, is this legit, is this
  legitimate, is this solid; is this true, is that true, is this real, is this
  accurate, is this correct, is that right, is this factual, is this right, does
  this check out, holds up, accuracy, correctness, veracity, truthfulness; is
  this a hallucination, hallucination, hallucinate, hallucinating, made up,
  made-up, making it up, is it making this up, fabricated, fabrication,
  confabulation, invented, not real, bogus, is this BS, is this nonsense, is
  this wrong, could this be wrong, catch errors, catch mistakes, catch
  falsehoods, flag hallucinations, spot the lie, find the error; warrant,
  attestation, attest, attested, certified, certification, signed proof,
  cryptographic proof, proof, receipt, signed receipt, evidence, evidence
  trail, provenance, signed hash, get the proof, get the warrant, pull the
  warrant, show me the warrant, fetch the warrant, look up the warrant, explain
  the verdict, explain this verdict, why was it rejected, why contested, why is
  the score low, what did it flag, look up a verification, by verification_id,
  by warrant id; guard against, guardrail, safety-check, before I rely on this,
  before I send this, before I ship this, before I publish this, before I cite
  this, before I quote this, before I act on this, before I trust this, is this
  safe to use, is this answer safe; the AI said, the model said, ChatGPT said,
  Claude said, the chatbot said, an LLM told me, LLM output, model output, AI
  output, this answer, this response; check this source, does this source
  support the claim, is this grounded, is it grounded, source-backed, backed by
  sources, grounding, run it through Aether, run Aether, verify with Aether,
  check with Aether, Aether check, use Aether, ask Aether. NOT for general web
  search or finding new citations from scratch (use a search / research skill —
  Aether checks a claim you already have, it does not go find one), and NOT for
  running the tribunal locally — Aether is a thin proxy in front of the Base44
  engine and cannot regenerate a warrant it never cached.
allowed-tools: mcp__aether__verify_claim mcp__aether__explain_verdict mcp__aether__get_warrant
license: MIT
metadata:
  version: 1.0.0
  aether-mcp-server: aether@1.0.0
---

# Aether Verify — catch AI hallucinations with signed warrants

Aether checks whether an AI-generated answer is trustworthy. You submit the
answer text (plus optional source URLs); an upstream tribunal decomposes it,
cross-examines it, scores it, and signs a **warrant** (a durable proof record).
These MCP tools are the interface to that engine. Use them to put a verdict and
a trust score on any claim before the user relies on it.

## When to use

Fire this skill when the user wants to:

- **Fact-check / verify / trust-check** an AI answer or a specific claim before acting on it.
- **Catch or guard against hallucination or fabrication** — "is this made up?", "is this real?", "double-check this before I send it."
- **Get a trust score, verdict, certification, or signed warrant** for a statement.
- **Audit a claim with sources** — the user has one or more source URLs and wants the claim checked against them.
- **Re-explain or pull the proof** of a check they already ran (they have a `verification_id`).

Good default: after producing a factual answer the user will depend on, offer to
run it through `verify_claim` and report the verdict + trust score.

## When NOT to use

| Situation | Use instead |
|---|---|
| Finding facts / web search / gathering citations from scratch | a web-search or research skill (Aether checks a claim, it does not go find one) |
| Wanting the tribunal logic itself, or to sign/persist a warrant locally | not possible here — Aether is a thin proxy; the engine lives in Base44 |
| Looking up a `verification_id` this worker never cached, or one older than 30 days | can't be retrieved via these tools (KV-only, 30-day TTL) — re-run `verify_claim` |
| General SF2X truth-core / evidence-label work in-repo | `sf2x-truth-core` |

## Prerequisites / availability

These tools exist only when the **Aether MCP server is connected** to this
client. The tool ids are:

- `mcp__aether__verify_claim`
- `mcp__aether__explain_verdict`
- `mcp__aether__get_warrant`

If they are not present in your tool list, the server is not connected. **Tell
the user to connect/authorize the Aether MCP server in their connector settings
(or `/mcp` / `claude mcp`).** Do not attempt to authenticate, and do not ask for
any token or key — auth is handled entirely by the MCP client's connection
config (see Guardrails).

## The tools

Typical workflow: **`verify_claim`** (runs the check, returns a
`verification_id`) → later **`explain_verdict`** (quick recap) or
**`get_warrant`** (full signed proof) using that id.

| Tool | Purpose | Calls upstream? | Key inputs |
|---|---|---|---|
| `verify_claim` | Verify an answer; returns verdict + trust score + id | Yes — upstream runs the tribunal | `text` (req), `domain`, `sources[]` |
| `explain_verdict` | Short recap of a prior verification | No — reads worker cache | `verification_id` (req) |
| `get_warrant` | Full signed-warrant proof record | No — reads worker cache | `verification_id` (req) |

### verify_claim

Submit the answer to verify.

- **Inputs:**
  - `text` — string, **required**. The answer/claim to verify. Empty or whitespace-only is rejected.
  - `domain` — string, optional (defaults to `"General"`). A topic label, e.g. `"Medical"`, `"Finance"`.
  - `sources` — array, optional. Each item is `{ "url": "https://…" (required), "excerpt": "…" (optional) }`. URLs are SSRF-filtered (non-http(s) schemes, localhost, and private/link-local IPs are dropped). **Only the URLs are forwarded upstream; excerpts are stored in the cache record but never sent to the engine** (and are truncated to 2000 chars).
- **Returns (7 fields):** `verification_id`, `warrant_id`, `verdict`, `trust_score`, `certified` (bool), `certification` (string), `warrant_signed` (bool). The `signed_hash`, decomposed `premises`, and stored sources are **not** returned here — use `get_warrant` for those.
- **Cost note:** this runs the full upstream tribunal. Run it once per distinct claim; reuse the returned `verification_id` for follow-ups instead of re-verifying identical text.

Example call:

```json
{
  "text": "The Eiffel Tower is 330 metres tall.",
  "domain": "General",
  "sources": [{ "url": "https://en.wikipedia.org/wiki/Eiffel_Tower", "excerpt": "…330 m…" }]
}
```

Then report the `verdict` and `trust_score` to the user, and **keep the
`verification_id`** — it is the handle for `explain_verdict` and `get_warrant`.

### explain_verdict

Get a short explanation of a prior verification.

- **Input:** `verification_id` — string, **required** (the id from a previous `verify_claim`).
- **Returns (7 fields):** `verification_id`, `warrant_id`, `verdict`, `trust_score`, `certified`, `certification`, `created_at`.
- Read-only: no upstream call, no re-run. If the id was never cached by this worker or its 30-day TTL has expired, it returns a "not found" error.

### get_warrant

Get the full signed-proof record.

- **Input:** `verification_id` — string, **required**.
- **Returns (11 fields):** `verification_id`, `warrant_id`, `verdict`, `trust_score`, `signed_hash`, `premises` (the decomposed atomic claims), `sources` (with excerpts as stored), `certified`, `certification`, `created_at`, `raw_upstream` (the complete stored engine response).
- Use this when the user wants the evidence trail, the decomposed premises, or the cryptographic `signed_hash`. Read-only, same 30-day / never-cached caveat as above.

## Interpreting the verdict and trust score

Read the returned **`verdict`** field directly — it is authoritative and comes
from the upstream engine. `trust_score` is the numeric confidence.

The worker maps a numeric score to a verdict **only as a fallback, when the
engine omits its own verdict**. Use these bands as a rough guide to what the
number means — do not re-derive a verdict yourself:

| trust_score | fallback verdict | reading |
|---|---|---|
| ≥ 75 | `verified` | claim is well-supported |
| 50–74 | `contested` | mixed / partially supported — flag caution |
| < 50 | `rejected` | unsupported or likely false — do not rely on it |

Also surface:

- **`certified` / `certification`** — whether the verification was certified (bool + label such as `"certified"` / `"uncertified"`).
- **`warrant_signed`** — `true` means a cryptographic signature (`signed_hash`) exists; the signed proof is retrievable via `get_warrant`.

When reporting to the user, give them the verdict, the trust score, and whether
it was certified/signed — e.g. *"Verdict: contested (trust 62/100), signed
warrant available — treat the disputed part with caution."*

## Failure handling

- **Empty/whitespace `text`** → `text is required`. Ask the user for the claim.
- **Missing / never-cached / expired `verification_id`** → "not found" (these tools read only this worker's 30-day KV cache; they cannot fetch the durable Base44 record). Offer to re-run `verify_claim`.
- **Warrant store unavailable** → the worker's cache binding is missing; report it, don't retry blindly.
- **Upstream error from `verify_claim`** — errors come back as an MCP result with `isError: true` and `{"error": "…"}`. **Report the exact error; never invent a verdict or trust score to fill the gap.**
- **Possible infra error — upstream model billing:** the upstream engine calls a model provider (OpenRouter). If that account is ever unfunded or over its limit, `verify_claim` can return an upstream billing/credits error. Treat this as **infrastructure state, not a failure of the claim**: report it as *"Aether's upstream engine returned a billing/credits error — the claim itself was not evaluated,"* and do **not** describe the claim as rejected or false because of it. (As of 2026-08-05 the engine is funded and returning live verdicts; this is a defensive note, not the current state.)

## Guardrails

- **Never handle, print, log, echo, or ask the user for any secret** — not the MCP bearer token (`AETHER_MCP_TOKEN`), not the upstream API key (`sk_sf2x_…` / `AETHER_API_KEY`), not the attestation signing key. Auth is entirely the MCP client's and the server's job. You only ever pass tool arguments (`text`, `domain`, `sources`, `verification_id`) and read tool outputs. If the tools aren't connected, route the user to their connector settings — do not try to supply credentials.
- **Never fabricate results.** If a tool errors or a warrant isn't found, report the failure plainly. A missing warrant is not a `rejected` verdict.
- **`verify_claim` runs real upstream compute** (a paid tribunal). Don't spam it — verify a given claim once and reuse its `verification_id`. `explain_verdict` and `get_warrant` are free, read-only lookups; prefer them for follow-ups.
- **The `verification_id` is the durable handle.** Preserve it and surface it to the user so a check can be re-explained or its proof pulled later.

## What Aether actually does (and does not)

Be honest about the architecture — do not overstate the tools:

- The **worker is a thin transport + verdict cache.** It does **not** run the proposer/critic/verifier + red-team tribunal, does **not** decompose the text into atomic claims, and does **not** sign warrants. All of that happens in the upstream **Base44 engine**.
- **Signing** uses a key (`sf2x_attestation_key`) that lives entirely in Base44; the tool only reports whether a signature exists (`warrant_signed`).
- **Base44's Warrant entity is the durable source of truth.** The worker only keeps a **30-day KV cache** of the verdict record. `explain_verdict` and `get_warrant` read that cache only — they **cannot regenerate or re-fetch** a warrant from Base44, so an id that was never cached here or has expired is unretrievable via these tools even though the durable warrant still exists upstream.
- Source **excerpts** you pass to `verify_claim` are kept in the cache for the proof record but are **not** sent to the engine — only the URLs are.
