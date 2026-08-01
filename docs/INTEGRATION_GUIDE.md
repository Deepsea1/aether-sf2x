# Aether by SF2X — Integration Guide

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
curl -X POST https://api.base44.com/apps/6a6babb38b48187e5d4799c4/backend/functions/webhookVerify \
  -H "Content-Type: application/json" \
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
