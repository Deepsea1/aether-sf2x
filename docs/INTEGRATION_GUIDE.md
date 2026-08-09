# Aether by SF2X — Integration Guide

> ✅ **The `/webhookVerify` endpoint the Zapier and Make sections depend on is now
> deployed** (re-probed 2026-08-09: `401 "Missing x-api-key header"`, i.e. present and
> auth-gated). An earlier revision of this guide said it was undeployed; that was true
> at the time and is no longer. Remember to send the `x-api-key` header — every example
> below now does.

## Zapier Integration

### Trigger: New Verification Result
Use Aether's webhook verification to trigger Zapier workflows when an AI response is verified.

**Setup:**
1. In Zapier, create a new Zap
2. Choose "Webhooks by Zapier" as the trigger
3. Select "Catch Hook" 
4. Copy the Zapier webhook URL
5. Call Aether's webhookVerify endpoint with that URL:

```bash
curl -X POST https://aether.sf2x.com/api/functions/webhookVerify \
  -H "Content-Type: application/json" \
  -H "x-api-key: $AETHER_API_KEY" \
  -d '{
    "text": "Your AI response to verify",
    "webhook_url": "https://hooks.zapier.com/hooks/catch/your-zap-id/"
  }'
```

6. Zapier will receive the verification result and can:
   - Post to Slack if trust_score < 50
   - Create a ticket in Jira/Linear for contested responses
   - Send an email alert for rejected responses
   - Log to Google Sheets for audit trail
   - Trigger a Slack notification to the AI team

### Example Zap: Auto-flag hallucinated responses in Slack
- **Trigger:** Webhooks by Zapier → Catch Hook
- **Filter:** Only continue if `verdict` is `contested` or `rejected`
- **Action:** Slack → Send Message: "🚨 Aether flagged an AI response: {{trust_score}}/100 — {{verdict}}. Corrections needed."

---

## Make (Integromat) Integration

### Setup:
1. Create a new scenario in Make
2. Add a "Custom Webhook" module as the trigger
3. Copy the Make webhook URL
4. Call Aether's webhookVerify with that URL
5. Add filter modules based on trust_score and verdict
6. Route to your preferred action modules

### Example Scenario: AI Quality Dashboard
1. **Trigger:** Custom Webhook (receives Aether verification results)
2. **Filter:** trust_score < 80 (only flagged responses)
3. **Action:** Google Sheets → Add Row (log the verification)
4. **Action:** Slack → Send Message (alert the team)
5. **Router:** If verdict = "rejected" → Email alert to AI lead

---

## Slack App Integration

### Managed alerting — `POST /alerts/dispatch` (recommended)

Instead of hand-rolling a card, hand a verification to the Aether MCP worker and let it
decide whether the result is worth paging a channel about, then format and deliver it.

```bash
curl -X POST https://aether-mcp.campiper84.workers.dev/alerts/dispatch \
  -H "Authorization: Bearer $AETHER_MCP_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "verification": { "trust_score": 45, "verdict": "rejected", "domain": "Legal",
                      "flags": ["Unverified citation reference detected"],
                      "lineage_id": "lin_123" },
    "webhook_url": "https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK"
  }'
```

**`verification`** accepts any shape Aether already produces — a `verifyResponse` body, an
outbound `verification.complete` webhook event (wrapped in `data` or not), or a warrant
record. Fields it is not given stay absent rather than being guessed at.

**`webhook_url`** works for both Slack and Microsoft Teams; the channel is inferred from
the host. Pass `"channel": "slack" | "teams"` explicitly for any other endpoint.

#### Trigger policy

Alerts fire only when a rule matches (rules are OR'd). Defaults:

| Rule | Default | Meaning |
|---|---|---|
| `minTrustScore` | `70` | Alert when the trust score is below this |
| `verdicts` | `["rejected"]` | Alert on these verdicts |
| `fabricatedCitationInHighRiskDomain` | `true` | Alert on an unverifiable citation in Legal / Medicine / Health / Finance |
| `fabricatedCitationAnywhere` | `false` | Opt in to citation alerts in every domain |

```json
{ "rules": { "minTrustScore": 85, "verdicts": ["rejected", "contested"] } }
```

A verification with **no** trust score does not trigger the score rule — an absent score
is not a low score, and treating it as `0` would page the team on every partial payload.

#### Response

```json
{
  "alerted": true,
  "reasons": ["Trust score 45 is below the threshold of 70", "Verdict is \"rejected\""],
  "channel": "slack",
  "policy": { "minTrustScore": 70, "verdicts": ["rejected"] },
  "delivery": { "ok": true, "status": 200 }
}
```

`"alerted": false` with `"delivery": null` is a **success**: the rules were evaluated and
nothing warranted an alert. `reasons` always explains the decision either way.

#### Preview a card without sending it

```bash
curl -X POST .../alerts/dispatch -H "Authorization: Bearer $AETHER_MCP_TOKEN" \
  -d '{ "verification": {...}, "channel": "slack", "dry_run": true }'
```

Returns the exact payload under `payload` and delivers nothing. Add `"force": true` to
format a card even when no rule fires (useful for testing a channel end to end).

#### What the card shows

Trust-score gauge (`████░░░░░░ 45/100`), the verdict and domain, why the alert fired, the
unsupported claims each with the tribunal's reason, the supported claims beside them, any
corrections, and a **View Cryptographic Warrant** button. When a payload carries no
per-claim breakdown the card says so, rather than implying everything passed.

#### Security

- Auth is the same static bearer as the MCP endpoint, and **fails closed** — no token
  configured means every request is rejected.
- `webhook_url` is customer-supplied and therefore an SSRF vector. It is checked against
  the shared guard before any request: non-`http(s)` schemes and localhost / private /
  link-local addresses (including `169.254.169.254`) are refused, and the request is
  never made.
- Rate limited per caller and per IP on the same counters as the MCP tools.
- A delivery failure returns `502` with the reason and never throws, so an alerting
  outage cannot take down the verification path that triggered it.

### Direct webhook to Slack
```bash
# After verification, post to Slack
curl -X POST https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK \
  -H "Content-Type: application/json" \
  -d '{
    "text": "🛡️ Aether Verification Complete",
    "attachments": [{
      "color": "danger",
      "fields": [
        {"title": "Trust Score", "value": "45/100", "short": true},
        {"title": "Verdict", "value": "REJECTED", "short": true},
        {"title": "Flags", "value": "Fabricated citation, Overgeneralized claim"}
      ]
    }]
  }'
```

---

## Python Integration

```python
from aether_sdk import AetherClient

aether = AetherClient(api_key="your-key")

# Real-time verification in your pipeline
result = aether.verify(user_response)

if result["verdict"] == "rejected":
    # Block the response
    raise HallucinationDetected(result["corrections"])
elif result["verdict"] == "contested":
    # Flag for human review
    flag_for_review(result)
else:
    # Safe to show
    return user_response
```

---

## Node.js Integration

```javascript
const { AetherClient } = require("./aether_sdk");

const aether = new AetherClient("your-key");

// Express middleware for AI response verification
app.post("/api/chat", async (req, res) => {
  const aiResponse = await getAIResponse(req.body.prompt);
  
  // Verify before sending to user
  const verification = await aether.verify(aiResponse);
  
  if (verification.verdict === "rejected") {
    return res.status(422).json({
      error: "AI response contained hallucinations",
      corrections: verification.corrections
    });
  }
  
  res.json({
    response: aiResponse,
    trust_score: verification.trust_score,
    warrant_id: verification.warrant_id
  });
});
```

---

## Webhook Payload Reference

When Aether sends a webhook, the payload looks like:

```json
{
  "event": "verification.complete",
  "data": {
    "verification_id": "vrf_1234567890",
    "trust_score": 45,
    "verdict": "rejected",
    "flags": [
      "Unverified citation reference detected",
      "Absolute/overgeneralized claim detected"
    ],
    "text_preview": "First 200 chars of verified text...",
    "timestamp": "2026-08-01T12:00:00.000Z"
  }
}
```

Headers:
- `X-Aether-Event`: `verification.complete`
- `X-Aether-Signature`: `sha256=<verification_id>`
- `Content-Type`: `application/json`

---

## Rate Limits

| Tier | Requests/min | Requests/month | Webhooks |
|------|-------------|----------------|----------|
| Free | 10 | 100 | ✅ |
| Starter | 60 | 5,000 | ✅ |
| Pro | 200 | 25,000 | ✅ |
| Enterprise | Unlimited | Unlimited | ✅ + dedicated |
