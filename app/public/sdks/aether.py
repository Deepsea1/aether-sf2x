"""Aether — The Truth Layer for AI · Python SDK

Install:  pip install requests
Usage:
    from aether import Aether
    a = Aether(api_key="sk_sf2x_...", origin="https://your-app.base44.app")
    v = a.verify("Vitamin C prevents the common cold.", domain="Medicine")
    print(v["trust_score"], v["verdict"], v["corrections"])
    t = a.tribunal("Is daily aspirin safe?", domain="Medicine", stakes="medium")
    bench = a.benchmark()
"""
import requests


class Aether:
    def __init__(self, api_key, origin="https://your-app.base44.app"):
        self.api_key = api_key
        self.origin = origin.rstrip("/")

    def _headers(self):
        return {"x-api-key": self.api_key, "Content-Type": "application/json"}

    def verify(self, text, domain="General", source="python-sdk", grounding_doc_ids=None):
        body = {"text": text, "domain": domain, "source": source}
        if grounding_doc_ids:
            body["grounding_doc_ids"] = grounding_doc_ids
        r = requests.post(f"{self.origin}/functions/verifyResponse", json=body, headers=self._headers(), timeout=60)
        r.raise_for_status()
        return r.json()

    def verify_stream(self, text, domain="General", source="python-sdk"):
        """Streams verification events (analyzing -> claim... -> verdict -> done)."""
        import json
        with requests.post(f"{self.origin}/functions/streamVerify",
                           json={"text": text, "domain": domain, "source": source},
                           headers=self._headers(), stream=True, timeout=120) as r:
            r.raise_for_status()
            for line in r.iter_lines():
                if line and line.startswith(b"data: "):
                    yield json.loads(line[6:])

    def tribunal(self, prompt, domain="General", stakes="medium"):
        r = requests.post(f"{self.origin}/functions/inquireTribunal",
                          json={"prompt": prompt, "domain": domain, "stakes": stakes},
                          headers=self._headers(), timeout=180)
        r.raise_for_status()
        return r.json()

    def batch(self, items):
        """items: list of {"text": ..., "domain": ...} (max 10)."""
        r = requests.post(f"{self.origin}/functions/verifyBatch",
                          json={"items": items}, headers=self._headers(), timeout=120)
        r.raise_for_status()
        return r.json()

    def benchmark(self):
        r = requests.get(f"{self.origin}/entities/BenchResult",
                         params={"sort": "-bench_score", "limit": 20}, timeout=30)
        r.raise_for_status()
        return r.json()
