# Aether by SF2X — Developer Documentation

## Overview

Aether by SF2X provides real-time AI trust verification through a 3-model tribunal architecture. This documentation covers all available API endpoints, integration patterns, and code examples.

## Base URL

```
https://aether.sf2x.com/api/functions/
```

## Authentication

All API requests require a valid API key, sent in the **`x-api-key`** header:

```bash
x-api-key: YOUR_API_KEY
```

Get your API key from the Aether dashboard at https://aether.sf2x.com/api-docs.

> **Corrected 2026-08-09.** This previously documented `Authorization: Bearer
> YOUR_API_KEY`, which the API does not accept — it answers
> `401 {"error":"Missing x-api-key header"}`. The base URL above was corrected in the
> same pass: the old `api.base44.com/apps/<id>/backend/functions/` base returns **404
> with an HTML error page** for every function.

## Endpoint status

Re-probed 2026-08-09 (later the same day) against the base URL above. **All four are
live.**

| Endpoint | Status |
|---|---|
| `/verifyResponse` | ✅ Live — `200` with a real tribunal verdict |
| `/batchVerify` | ✅ Live — `401 "Missing x-api-key header"` without a key (present and auth-gated) |
| `/webhookVerify` | ✅ Live — `401` without a key |
| `/warrantApi` | ✅ Live — `401` without a key |

> **Earlier today this table said otherwise, and it was right at the time.**
> `/batchVerify` and `/webhookVerify` answered `404 "Backend function … not found or
> not deployed"`, and `/verifyResponse` answered `500 "Permission denied for create
> operation on Inquiry entity"`. All three were fixed on the Base44 side. The
> distinction that matters when re-checking: a **`404` naming the function** means it
> is not deployed, whereas a **`401` asking for `x-api-key`** means it is deployed and
> simply wants a key.

💸 **`/batchVerify` now meters per text (2 credits × N) and caps batches per plan** —
the un-metered 50× cost multiplier previously documented here was closed by the
2026-08-10 deploy. See its section below.

## Endpoints

### 1. Verify Response (Single)

**POST** `/verifyResponse`

Verify a single text response for hallucinations.

**Request:**
```json
{
  "text": "According to Section 4.1 of the employee handbook, employees receive 15 vacation days in their first year."
}
```

**Response:**
```json
{
  "trust_score": 40,
  "verdict": "contested",
  "corrections": [
    "Cite the specific employer and provide the exact text or link to Section 4.1...",
    "Do not state absolute standards across all companies..."
  ],
  "claims": [
    {
      "claim": "According to Section 4.1...",
      "supported": false,
      "notes": "No source or employer is cited..."
    }
  ],
  "warrant_id": "6a6de04b26cf84c8aa37847f",
  "tribunal_url": "/verify/6a6de04b14738e49e8db0ee0",
  "lineage_id": "6a6de04b14738e49e8db0ee0",
  "latency_ms": 14255
}
```

**Example (curl):**
```bash
curl -X POST https://aether.sf2x.com/api/functions/verifyResponse \
  -H "Content-Type: application/json" \
  -H "x-api-key: $AETHER_API_KEY" \
  -d '{"text": "Your text to verify here"}'
```

### 2. Batch Verify

> ✅ **Deployed** (re-probed 2026-08-09).
>
> ✅ **Corrected 2026-08-10 — the metering hole is closed.** The cost warning that
> stood here ("live and un-metered per text", a 50× spend multiplier) described the
> old directly-deployed function, and it was right at the time. The guarded
> implementation (`app/base44/functions/batchVerify/entry.ts`) was deployed to
> Base44 on 2026-08-10, and all three fixes the old warning asked for landed
> together. What the deployed code does:
>
> - **Meters per text, not per request.** A batch of N texts charges **2 × N
>   credits** against the same monthly quota as `/verifyResponse` (2 credits per
>   text). The 50× multiplier is arithmetic now: 50 texts cost 100 credits.
>   Per-item provider failures keep their slot in `results` (as
>   `{ "index", "text_preview", "word_count", "error" }`) and are excluded from
>   the summary counts and the average, but every text that entered the run is
>   billed. Blank entries are dropped before the run (never billed); surviving
>   items keep their original `index`.
> - **Caps batch size by plan.** Free **5** · Starter **20** · every other plan
>   **50** (the absolute maximum). Unknown plans fail closed to the Free cap.
>   Over the plan cap → `400` with the reason
>   `"The <plan> plan allows at most <cap> items per batch (received <count>). Split the batch or upgrade the plan."`
>   More than 50 texts is rejected with `400 "Max 50 texts per batch"` regardless
>   of plan — never silently truncated.
> - **Rejects insufficient headroom with `429`.** The whole batch must fit the
>   remaining monthly credits **before** any tribunal call runs. When 2 × N
>   exceeds the remaining credits: `429` with
>   `"This batch needs <cost> credits but only <left> remain in the monthly quota for the <plan> plan. The batch was not run and nothing was charged."`
>   An already-exhausted quota answers
>   `429 "Monthly verification quota exceeded"`. Either way, a rejected batch
>   runs nothing and charges nothing.
>
> The same whole-batch headroom rule now governs the other batch endpoints:
> `/batchWarrant` (≤ 25 answers, 5 credits per item — `413` over 25) retired its
> old "overshoot-once" allowance, where 1 remaining credit admitted a full batch;
> it now answers `429` when the batch cost exceeds the remaining credits, running
> nothing and charging nothing. `/verifyBatch` (the retroactive-audit endpoint,
> ≤ 10 items) applies the identical pre-run check.

**POST** `/batchVerify`

Verify multiple texts in a single request (max 50 per batch).

**Request:**
```json
{
  "texts": [
    "First text to verify",
    "Second text to verify",
    "Third text to verify"
  ],
  "options": {
    "model": "gpt-4o"
  }
}
```

**Response:**
```json
{
  "results": [
    {
      "index": 0,
      "text_preview": "First text to verify...",
      "trust_score": 85,
      "verdict": "verified",
      "flags": [],
      "word_count": 5
    },
    {
      "index": 1,
      "text_preview": "Second text to verify...",
      "trust_score": 40,
      "verdict": "contested",
      "flags": ["Unverified citation reference detected"],
      "word_count": 5
    }
  ],
  "summary": {
    "total": 3,
    "verified": 1,
    "contested": 1,
    "rejected": 1,
    "average_trust_score": 58,
    "batch_verdict": "contested"
  }
}
```

**Example (Python):**
```python
import requests

response = requests.post(
    "https://aether.sf2x.com/api/functions/batchVerify",
    json={
        "texts": [
            "According to Section 4.1, employees get 15 days off.",
            "This is standard across all companies in the US.",
            "You should check with your HR department for specifics."
        ]
    },
    headers={"Content-Type": "application/json", "x-api-key": API_KEY}
)

data = response.json()
print(f"Batch verdict: {data['summary']['batch_verdict']}")
print(f"Average trust score: {data['summary']['average_trust_score']}/100")
```

### 3. Webhook Verification

> ✅ **Deployed** (re-probed 2026-08-09). Cost-safe: **one tribunal run per call**, the
> same spend as `/verifyResponse`, with no batching multiplier.
>
> ✅ **Corrected 2026-08-10 — the SSRF item is confirmed closed.** The caution that
> stood here ("this has not been verified against the deployed function") was
> written when `/webhookVerify` existed only as a directly-deployed function with
> no source in this repo. The in-repo implementation
> (`app/base44/functions/webhookVerify/entry.ts`) went to Base44 on 2026-08-10,
> behind the shared SSRF guard (`app/base44/shared/webhooks.js`). What the
> deployed code does:
>
> - **Requires an API key.** `401` without one, `403` for an invalid or inactive
>   key — delivery to arbitrary URLs is never anonymous.
> - **Validates `webhook_url` BEFORE any LLM spend.** Scheme allowlist
>   (`http:`/`https:` only), rejection of URLs with embedded credentials, and a
>   blocklist covering loopback, private ranges (10/8, 172.16/12, 192.168/16),
>   link-local, CGNAT (100.64/10), IPv6 loopback/unique-local/link-local (incl.
>   IPv4-mapped), and cloud-metadata hosts (`169.254.169.254`,
>   `metadata.google.internal`, …). Hostnames are DNS-resolved and every resolved
>   IP re-checked; an unresolvable hostname is blocked (**fail closed**). A
>   blocked or malformed URL answers `400 "invalid webhook_url: <reason>"` and
>   nothing is run or charged.
> - **Never auto-follows redirects.** Delivery goes through a guarded POST that
>   follows redirects manually, re-validating every `Location` hop against the
>   same blocklist, capped at 5 hops — a `302` to an internal address is blocked,
>   not followed.
> - **Reports delivery failure honestly.** If the webhook POST fails after the
>   verification ran, the response is
>   `502 { "status": "webhook_failed", "webhook_error": …, "verification": … }` —
>   the verification result is still returned (and billed), and the status is
>   never claimed as `webhook_sent`. On success:
>   `200 { "status": "webhook_sent", "webhook_status": <delivery HTTP status>, "verification": … }`.
>
> Billing is unchanged: one tribunal run per call, 2 credits, metered against the
> same quota as `/verifyResponse`. A verdict-cache hit (see "Caching & verdict
> reuse" below) skips the tribunal, bills **0** credits, still fires the webhook,
> and marks the response `cached: true`.

**POST** `/webhookVerify`

Verify text and send results to a webhook URL (async pattern).

**Request:**
```json
{
  "webhook_url": "https://your-app.com/webhook/aether",
  "text": "Text to verify",
  "verification_id": "optional-custom-id"
}
```

**Response:**
```json
{
  "status": "webhook_sent",
  "webhook_status": 200,
  "verification": {
    "verification_id": "vrf_1234567890",
    "trust_score": 85,
    "verdict": "verified",
    "flags": [],
    "timestamp": "2026-08-01T12:00:00.000Z"
  }
}
```

## Caching & verdict reuse

> Added 2026-08-10, with the deployed implementations above.

`/verifyResponse` memoizes verdicts by **exact content**. Before any LLM call, the
request is reduced to a reuse key:

```
reuse_key = SHA-256( JCS({
  "kind": "text",
  "text_sha256":      SHA-256 of the FULL submitted text (never a prefix),
  "domain":           the request domain (default "General"),
  "model":            the effective model — "openai/gpt-4o-mini", or
                      "byok:<model>" for bring-your-own-key calls,
  "pipeline_version": "2.1.0-hr-guardrails"
}) )
```

`JCS` is RFC 8785 canonical JSON (object keys sorted by UTF-16 code units). All
four components must match for a hit — so a hit is only ever an exact re-run of
the same verification, a BYOK run only ever matches BYOK runs on the same model,
and bumping the pipeline version invalidates the whole cache at once.

Behavior:

- **Hit:** the stored response is replayed verbatim — same `trust_score`,
  `verdict`, `corrections`, `claims`, `warrant_id`, `lineage_id` — plus
  `"cached": true` and `"cache_age_seconds": <seconds since it was stored>`. No
  LLM call runs.
- **TTL: 7 days.** An expired record reads as a miss and the pipeline re-runs.
- **Grounded requests bypass the cache entirely** — when `grounding_doc_ids` is
  present the verdict depends on the documents, which are not part of the key,
  so those runs are neither served from nor written to the cache.
- **Errors are never cached**, and cache failures **fail open**: a broken cache
  read or write falls through to a full pipeline run — the cache can only ever
  save cost, never change a verdict.
- `/webhookVerify` reads the same cache (read-only, non-BYOK entries): a hit
  bills **0** credits, still fires a fresh webhook delivery, and carries
  `cached: true` in the response.

## Latency budgets

> Added 2026-08-10. These are **targets being measured** (MASTER_PLAN v5 §7.1),
> not guarantees — they will be revised against live SLO data.

| Path | Target |
|------|--------|
| Cached verdict hit (`cached: true`) | < 1 s |
| Single tribunal verify | p50 ≈ 15 s · p95 ≈ 40 s |
| PR verification, warm cache | ≤ 3 min p50 |

The measured baseline for a single full tribunal run is **~14 s** — the
`latency_ms: 14255` in this document's own `/verifyResponse` example response is
a live probe, not a mock, and is what the p50 target is calibrated against. The
cache is what bends the curve: identical content re-verified within the TTL
skips the tribunal entirely, and PR verification re-checks only claims whose
content actually changed.

## Trust Score Scale

| Score | Verdict | Meaning |
|-------|---------|---------|
| 80-100 | verified | Claims are well-supported with proper disclaimers |
| 50-79 | contested | Some claims unsupported — corrections issued |
| 0-49 | rejected | Major hallucinations or fabrications detected |

## Tribunal Architecture

```
Input Text
    ↓
[Proposer] → Generates initial answer
    ↓
[Critic] → Adversarially challenges every premise, citation, and logical step
    ↓
[Verifier] → Renders verdict with trust score and specific corrections
    ↓
Cryptographic Warrant (premises, sources, signed hash)
```

## Verdict Values

- **verified** — The response is well-supported. Trust score 80+.
- **contested** — Some claims are unsupported. Corrections provided. Trust score 50-79.
- **rejected** — Major hallucinations detected. Do not use this response. Trust score <50.

## Independent warrant verification (v2)

> Added 2026-08-10, with the deployed implementations above.

Warrants created since the 2026-08-10 deploy are **dual-signed**: the legacy
`signed_hash` (kept byte-for-byte for existing consumers) plus an RFC 8785
canonical **v2** signature that a third party can verify with nothing from
Aether but the published public key.

### The signed payload

The v2 signature covers exactly this JSON object — these six keys, nothing else:

```json
{
  "schema": "aether.warrant.v2",
  "answer_version_id": "<AnswerVersion id — the lineage_id in API responses>",
  "answer_text_sha256": "<lowercase SHA-256 hex of the answer text>",
  "conclusion": "<the warrant's conclusion>",
  "premises": ["<claim>", "..."],
  "sources": ["<url>", "..."]
}
```

- **Canonicalize** per RFC 8785 (JCS): recursive object-key sort in UTF-16
  code-unit order, `JSON.stringify` serialization semantics, no whitespace.
- **`payload_hash_v2`** = lowercase SHA-256 hex over the canonical UTF-8 bytes.
- **`signed_hash_v2`** = Ed25519 signature over the **UTF-8 bytes of the
  `payload_hash_v2` hex string** (not the raw digest bytes), encoded as
  `sf2x_ed25519_` + base64url(signature).
- **`key_id`** = `ed25519:` + the first 16 hex chars of SHA-256 of the public
  key PEM string.
- **No `issued_at`** in the payload — the signature binds content only; time
  attestation comes from the transparency chain below.
- **`answer_text_sha256` hashes the answer text as persisted**, not as
  submitted: the endpoints truncate to 4,000 characters before storing, so hash
  the stored text (`text.slice(0, 4000)`) or recomputation will fail on longer
  inputs.

### Key discovery

- `GET https://aether.sf2x.com/.well-known/aether-keys.json` — a static pointer
  (`schema: "aether.keys.pointer.v1"`) naming the live endpoint.
- `GET|POST https://aether.sf2x.com/api/functions/aetherKeys` — the live, signed
  key document (`schema: "aether.keys.v1"`, no auth): `keys[]` with `key_id`,
  `algorithm: "Ed25519"`, `public_key_pem`, and `status`, plus `legacy_schemes`
  and a self-signed `payload_hash`/`signature` over
  `{ schema, keys, legacy_schemes }` using the same JCS + Ed25519 conventions.
  Self-signing proves transport integrity (a tampered document fails
  verification), **not** key authenticity — anchor first-fetch trust in the
  serving domain plus the transparency log; key rotation adds cross-signatures
  from the outgoing key.

### Legacy (v1) signing note

Pre-v2 warrants carry only `signed_hash`, computed over a `|`-joined string
with `;;` sub-joins in four variant forms — delimiter-ambiguous, which is why
the server brute-forces variants to verify them. Legacy **Ed25519** seals remain
publicly verifiable; **`HMAC-SHA256 server-attested`** and **`FNV fingerprint`**
seals are not (publishing the HMAC key would make it forgeable) — the registry
labels those `publicly_verifiable: false`. No historic warrant is orphaned:
legacy verification stays available server-side forever.

### Verification recipe (no Aether code)

1. Collect the six payload fields. `answer_version_id` is the `lineage_id` from
   the API response; `conclusion`, `premises`, and `sources` are the values
   persisted on the warrant; `answer_text_sha256` is stored on the warrant (or
   recomputed from the persisted answer text).
2. Rebuild the payload object with exactly the keys shown above.
3. JCS-canonicalize it and take the lowercase SHA-256 hex — it must equal
   `payload_hash_v2`.
4. Strip the `sf2x_ed25519_` prefix from `signed_hash_v2` and base64url-decode
   the remainder into the raw signature.
5. Verify the Ed25519 signature over the UTF-8 bytes of the hex hash string
   using the `public_key_pem` from key discovery (match on `key_id`).

### Inclusion proofs (RFC 6962)

`POST /api/functions/warrantApi` issues warrants;
`POST /api/functions/warrantRegistry` is the public, read-only transparency log
(no auth — it returns **integrity metadata only, never warrant content**). Look
up a warrant by `warrant_id`, `verification_id`, `lineage_id`, or `signed_hash`
and the `verified_warrant` block includes:

```json
"inclusion_proof": {
  "leaf_hash": "<lowercase hex>",
  "index": 42,
  "tree_size": 100,
  "siblings": ["<lowercase hex>", "..."],
  "algorithm": "RFC6962-SHA256"
}
```

- **Leaves** are the listing window's warrants ordered by `created_date`
  ascending with `id` as tie-break; each leaf string is the warrant's
  `signed_hash` (its `id` when unsigned).
- **Hashing** follows RFC 6962 §2.1: leaf hash = SHA-256(`0x00` ‖ leaf UTF-8
  bytes) · interior node = SHA-256(`0x01` ‖ left ‖ right) · unbalanced trees
  split at the largest power of two **less than** n (never by duplicating the
  last leaf).
- **To verify:** recompute leaf → root from `siblings` (ordered leaf → root)
  and compare against the response's `merkle_root`. Nothing but SHA-256 is
  required.
- A warrant outside the current listing window gets `inclusion_proof: null` —
  never a proof against a root it is not actually in. The response also carries
  the legacy linear `root` (SHA-256 of the `|`-joined leaves), kept for
  existing consumers.

## Rate Limits

| Tier | Requests/min | Requests/month |
|------|--------------|----------------|
| Free | 10 | 100 |
| Starter | 60 | 5,000 |
| Pro | 200 | 25,000 |
| Enterprise | Unlimited | Unlimited |

## Error Codes

| Code | Meaning |
|------|---------|
| 400 | Bad request — missing required fields |
| 401 | Unauthorized — invalid or missing API key |
| 429 | Rate limit exceeded |
| 500 | Internal tribunal error |

## SDK Examples

### JavaScript/Node.js
```javascript
const response = await fetch(
  "https://aether.sf2x.com/api/functions/verifyResponse",
  {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
    body: JSON.stringify({ text: "Your text here" })
  }
);
const result = await response.json();
console.log(`Trust score: ${result.trust_score}/100 — ${result.verdict}`);
```

### Python
```python
import requests

response = requests.post(
    "https://aether.sf2x.com/api/functions/verifyResponse",
    json={"text": "Your text here"},
    headers={"Content-Type": "application/json", "x-api-key": API_KEY}
)
result = response.json()
print(f"Trust score: {result['trust_score']}/100 — {result['verdict']}")
```

### cURL
```bash
curl -X POST https://aether.sf2x.com/api/functions/verifyResponse \
  -H "Content-Type: application/json" \
  -H "x-api-key: $AETHER_API_KEY" \
  -d '{"text": "Your text here"}'
```

## Webhook Integration

Register a webhook URL to receive verification results asynchronously:

```javascript
// Your webhook endpoint
app.post("/webhook/aether", (req, res) => {
  const event = req.headers["x-aether-event"];
  const result = req.body.data;
  
  if (event === "verification.complete") {
    console.log(`Verification ${result.verification_id}: ${result.trust_score}/100 (${result.verdict})`);
    
    if (result.verdict === "contested" || result.verdict === "rejected") {
      // Handle flagged content
      console.log("Corrections:", result.flags);
    }
  }
  
  res.status(200).send("OK");
});
```

## Chrome Extension

Download the Aether Chrome extension to add one-click verification to:
- ChatGPT (chat.openai.com)
- Claude (claude.ai)
- Gemini (gemini.google.com)
- Microsoft Copilot (copilot.microsoft.com)
- Perplexity (perplexity.ai)

The extension injects a "Verify with Aether" button next to AI responses. Click it to run the tribunal and see the trust score inline.

## Support

- API Docs: https://aether.sf2x.com/api-docs
- Benchmark: https://aether.sf2x.com/benchmark
- Playground: https://aether.sf2x.com/playground
- Email: cam@sf2x.com
