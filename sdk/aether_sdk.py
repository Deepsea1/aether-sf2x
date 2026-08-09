"""
Aether by SF2X — Python SDK.

Real, importable module. This previously existed only as a code block inside
sdk/README.md under "Save this as aether_sdk.py", while the top-level README
advertised a Python SDK — so the advertised SDK was not actually shipped.

Fixed here versus that inline version (all live-probed 2026-08-09):
  * Auth is `x-api-key`, NOT `Authorization: Bearer`. The API answers
    `401 {"error":"Missing x-api-key header"}` to a Bearer token.
  * Base URL is the app domain. The old
    `api.base44.com/apps/<id>/backend/functions` base returns 404 with an HTML
    page for every function.
  * `batch_verify` and `verify_webhook` raise a clear NotDeployedError instead of
    a confusing 404, because those two backend functions are not currently
    deployed (`404 "Backend function '...' not found or not deployed"`).

Requires: requests  (pip install requests)
"""

from __future__ import annotations

import os
from typing import Any, Dict, List, Optional

import requests

DEFAULT_BASE_URL = "https://aether.sf2x.com/api/functions"

#: Backend functions confirmed not deployed as of 2026-08-09.
NOT_DEPLOYED = ("batchVerify", "webhookVerify")

__all__ = ["AetherClient", "AetherError", "NotDeployedError", "DEFAULT_BASE_URL"]


class AetherError(RuntimeError):
    """An Aether API call failed. Carries the HTTP status and response body."""

    def __init__(self, message: str, status: Optional[int] = None, body: Any = None) -> None:
        super().__init__(message)
        self.status = status
        self.body = body


class NotDeployedError(AetherError):
    """The requested backend function is not deployed on the Aether app."""


class AetherClient:
    """Aether by SF2X — AI Trust Verification Client."""

    def __init__(
        self,
        api_key: str = "",
        base_url: str = DEFAULT_BASE_URL,
        timeout: float = 60.0,
    ) -> None:
        # An explicit key wins; otherwise fall back to the environment.
        self.api_key = api_key or os.environ.get("AETHER_API_KEY", "")
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

        self.headers: Dict[str, str] = {"Content-Type": "application/json"}
        if self.api_key:
            # The API requires this header specifically.
            self.headers["x-api-key"] = self.api_key

    # ── internals ──────────────────────────────────────────────────────────

    def _post(self, function: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        if function in NOT_DEPLOYED:
            raise NotDeployedError(
                f"The '{function}' backend function is not deployed on the Aether app "
                f"(live-probed 2026-08-09). Deploy it in Base44 before calling this. "
                f"See docs/API_REFERENCE.md -> Endpoint status.",
                status=404,
            )

        url = f"{self.base_url}/{function}"
        try:
            response = requests.post(
                url, json=payload, headers=self.headers, timeout=self.timeout
            )
        except requests.RequestException as exc:  # network-level failure
            raise AetherError(f"request to {url} failed: {exc}") from exc

        if not response.ok:
            body: Any
            try:
                body = response.json()
            except ValueError:
                body = response.text[:500]
            hint = ""
            if response.status_code == 401 and not self.api_key:
                hint = " (no API key was provided — set AETHER_API_KEY or pass api_key)"
            raise AetherError(
                f"Aether API returned {response.status_code}{hint}: {body}",
                status=response.status_code,
                body=body,
            )

        try:
            return response.json()
        except ValueError as exc:
            raise AetherError("Aether API returned a non-JSON response") from exc

    # ── public API ─────────────────────────────────────────────────────────

    def verify(self, text: str) -> Dict[str, Any]:
        """Verify a single text response for hallucinations."""
        if not text or not text.strip():
            raise ValueError("text is required")
        return self._post("verifyResponse", {"text": text})

    def batch_verify(
        self, texts: List[str], options: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Verify multiple texts in one request (max 50). NOT CURRENTLY DEPLOYED."""
        if not texts:
            raise ValueError("texts must be a non-empty list")
        if len(texts) > 50:
            raise ValueError("batch_verify accepts at most 50 texts")
        payload: Dict[str, Any] = {"texts": texts}
        if options:
            payload["options"] = options
        return self._post("batchVerify", payload)

    def verify_webhook(
        self, text: str, webhook_url: str, verification_id: str = ""
    ) -> Dict[str, Any]:
        """Verify text and POST the result to a webhook. NOT CURRENTLY DEPLOYED."""
        if not text or not text.strip():
            raise ValueError("text is required")
        if not webhook_url:
            raise ValueError("webhook_url is required")
        payload: Dict[str, Any] = {"text": text, "webhook_url": webhook_url}
        if verification_id:
            payload["verification_id"] = verification_id
        return self._post("webhookVerify", payload)

    def get_trust_score(self, text: str) -> int:
        """Quick helper — just the trust score.

        Returns 0 when the response carries no score. A missing score is NOT
        evidence of trustworthiness, so callers gating on this should treat 0 as
        a failure rather than an unknown.
        """
        result = self.verify(text)
        score = result.get("trust_score")
        return score if isinstance(score, (int, float)) else 0

    def is_verified(self, text: str, threshold: int = 80) -> bool:
        """True when the text meets or exceeds the trust threshold."""
        return self.get_trust_score(text) >= threshold


if __name__ == "__main__":
    client = AetherClient()

    for sample in (
        "All companies in the US give 15 vacation days. This is federal law.",
        "PTO policies vary by employer. Check your employee handbook for specifics.",
    ):
        try:
            result = client.verify(sample)
            print(f"Score: {result.get('trust_score')}/100 — {result.get('verdict')}")
        except AetherError as exc:
            print(f"failed: {exc}")
