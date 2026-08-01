# Aether Python SDK

## Installation

```bash
pip install requests
```

## Quick Start

```python
from aether import AetherClient

# Initialize
aether = AetherClient(api_key="your-api-key")

# Verify a single response
result = aether.verify("According to Section 4.1, all employees get 15 days off.")
print(f"Trust score: {result['trust_score']}/100 — {result['verdict']}")

# Batch verify
results = aether.batch_verify([
    "First text to verify",
    "Second text to verify",
    "Third text to verify"
])
print(f"Average: {results['summary']['average_trust_score']}/100")

# Webhook verification
aether.verify_webhook(
    text="Text to verify",
    webhook_url="https://your-app.com/webhook"
)
```

## SDK Implementation

Save this as `aether_sdk.py`:

```python
import requests
import json
from typing import List, Dict, Optional

class AetherClient:
    """Aether by SF2X — AI Trust Verification Client"""
    
    BASE_URL = "https://api.base44.com/apps/6a6babb38b48187e5d4799c4/backend/functions"
    
    def __init__(self, api_key: str = ""):
        self.api_key = api_key
        self.headers = {"Content-Type": "application/json"}
        if api_key:
            self.headers["Authorization"] = f"Bearer {api_key}"
    
    def verify(self, text: str) -> Dict:
        """Verify a single text response for hallucinations."""
        response = requests.post(
            f"{self.BASE_URL}/verifyResponse",
            json={"text": text},
            headers=self.headers
        )
        response.raise_for_status()
        return response.json()
    
    def batch_verify(self, texts: List[str], options: Optional[Dict] = None) -> Dict:
        """Verify multiple texts in a single request (max 50)."""
        payload = {"texts": texts}
        if options:
            payload["options"] = options
        response = requests.post(
            f"{self.BASE_URL}/batchVerify",
            json=payload,
            headers=self.headers
        )
        response.raise_for_status()
        return response.json()
    
    def verify_webhook(self, text: str, webhook_url: str, verification_id: str = "") -> Dict:
        """Verify text and send results to a webhook URL."""
        payload = {"text": text, "webhook_url": webhook_url}
        if verification_id:
            payload["verification_id"] = verification_id
        response = requests.post(
            f"{self.BASE_URL}/webhookVerify",
            json=payload,
            headers=self.headers
        )
        response.raise_for_status()
        return response.json()
    
    def get_trust_score(self, text: str) -> int:
        """Quick helper — returns just the trust score."""
        result = self.verify(text)
        return result.get("trust_score", 0)
    
    def is_verified(self, text: str, threshold: int = 80) -> bool:
        """Check if text passes the verification threshold."""
        return self.get_trust_score(text) >= threshold


# Example usage
if __name__ == "__main__":
    aether = AetherClient()
    
    # Test with a hallucination
    result = aether.verify("All companies in the US give 15 vacation days. This is federal law.")
    print(f"Score: {result['trust_score']}/100 — {result['verdict']}")
    
    # Test with a proper response
    result = aether.verify("PTO policies vary by employer. Check your employee handbook for specifics.")
    print(f"Score: {result['trust_score']}/100 — {result['verdict']}")
```

## JavaScript/Node.js SDK

```javascript
class AetherClient {
  constructor(apiKey = "") {
    this.baseUrl = "https://api.base44.com/apps/6a6babb38b48187e5d4799c4/backend/functions";
    this.headers = { "Content-Type": "application/json" };
    if (apiKey) this.headers["Authorization"] = `Bearer ${apiKey}`;
  }

  async verify(text) {
    const res = await fetch(`${this.baseUrl}/verifyResponse`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ text })
    });
    return res.json();
  }

  async batchVerify(texts, options = {}) {
    const res = await fetch(`${this.baseUrl}/batchVerify`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ texts, options })
    });
    return res.json();
  }

  async verifyWebhook(text, webhookUrl, verificationId = "") {
    const res = await fetch(`${this.baseUrl}/webhookVerify`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ text, webhook_url: webhookUrl, verification_id: verificationId })
    });
    return res.json();
  }
}

module.exports = AetherClient;
```
