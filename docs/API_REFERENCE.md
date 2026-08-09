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

⚠️ **`/batchVerify` carries a cost multiplier — see its section below before using it
in anything user-facing.**

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
> 💸 **COST WARNING — this endpoint is now live and un-metered per text.** One
> `batchVerify` call runs the full tribunal **once per text**, up to 50 times, while the
> rate limits in this document are counted **per request**. That is a 50× spend
> multiplier: a Free-tier caller nominally limited to 100 requests/month can trigger
> **5,000 tribunal runs** without exceeding their quota.
>
> Fix it with at least one of:
> 1. **Meter per text, not per request** — charge `len(texts)` against the caller's
>    quota. This is the real fix; it makes the multiplier impossible. A ready-made,
>    tested implementation is in
>    [`mcp-worker/src/batchQuota.js`](../mcp-worker/src/batchQuota.js).
> 2. **Cap batch size by tier** — e.g. Free 5, Starter 20, Pro/Enterprise 50.
> 3. **Reject the batch** when `len(texts)` exceeds the caller's remaining quota,
>    rather than partially running it and billing for the rest.
>
> `/webhookVerify` does **not** carry this risk: one tribunal run per call, the same
> cost as `/verifyResponse`.

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
> ⚠️ **One security item to confirm in the deployed implementation:** `webhook_url` is caller-supplied and is
> therefore an SSRF vector. It must be validated before the outbound POST — reject
> non-`http(s)` schemes and localhost / private / link-local addresses (including
> `169.254.169.254`, the cloud metadata endpoint). The MCP worker already does exactly
> this in `mcp-worker/src/ssrf.js`; reuse that logic rather than writing it twice.
> **This has not been verified against the deployed function** — a caller who can pass
> an arbitrary `webhook_url` can otherwise make your backend probe its own network.

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
