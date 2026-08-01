# Aether by SF2X — Developer Documentation

## Overview

Aether by SF2X provides real-time AI trust verification through a 3-model tribunal architecture. This documentation covers all available API endpoints, integration patterns, and code examples.

## Base URL

```
https://api.base44.com/apps/6a6babb38b48187e5d4799c4/backend/functions/
```

## Authentication

All API requests require a valid API key. Include your API key in the `Authorization` header:

```bash
Authorization: Bearer YOUR_API_KEY
```

Get your API key from the Aether dashboard at https://aether.sf2x.ai/api-docs.

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
curl -X POST https://api.base44.com/apps/6a6babb38b48187e5d4799c4/backend/functions/verifyResponse \
  -H "Content-Type: application/json" \
  -d '{"text": "Your text to verify here"}'
```

### 2. Batch Verify

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
    "https://api.base44.com/apps/6a6babb38b48187e5d4799c4/backend/functions/batchVerify",
    json={
        "texts": [
            "According to Section 4.1, employees get 15 days off.",
            "This is standard across all companies in the US.",
            "You should check with your HR department for specifics."
        ]
    },
    headers={"Content-Type": "application/json"}
)

data = response.json()
print(f"Batch verdict: {data['summary']['batch_verdict']}")
print(f"Average trust score: {data['summary']['average_trust_score']}/100")
```

### 3. Webhook Verification

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
  "https://api.base44.com/apps/6a6babb38b48187e5d4799c4/backend/functions/verifyResponse",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
    "https://api.base44.com/apps/6a6babb38b48187e5d4799c4/backend/functions/verifyResponse",
    json={"text": "Your text here"},
    headers={"Content-Type": "application/json"}
)
result = response.json()
print(f"Trust score: {result['trust_score']}/100 — {result['verdict']}")
```

### cURL
```bash
curl -X POST https://api.base44.com/apps/6a6babb38b48187e5d4799c4/backend/functions/verifyResponse \
  -H "Content-Type: application/json" \
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

- API Docs: https://aether.sf2x.ai/api-docs
- Benchmark: https://aether.sf2x.ai/benchmark
- Playground: https://aether.sf2x.ai/playground
- Email: campiper84@gmail.com
