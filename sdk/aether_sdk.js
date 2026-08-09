/**
 * Aether by SF2X — JavaScript / Node.js SDK.
 *
 * Real, requirable module. This previously existed only as a code block inside
 * sdk/README.md while the top-level README advertised a JavaScript SDK — so the
 * advertised SDK was not actually shipped.
 *
 * Fixed here versus that inline version (all live-probed 2026-08-09):
 *   · Auth is `x-api-key`, NOT `Authorization: Bearer` — the API answers
 *     `401 {"error":"Missing x-api-key header"}` to a Bearer token.
 *   · Base URL is the app domain; the old `api.base44.com/apps/<id>/backend/functions`
 *     base returns 404 with an HTML page for every function.
 *   · Both `module.exports = AetherClient` AND `module.exports.AetherClient` are set.
 *     The old file exported only the class, but the docs use
 *     `const { AetherClient } = require("./aether_sdk")`, which yielded `undefined`.
 *   · A non-2xx response now throws with the status instead of silently resolving to
 *     the error body — the old version returned `res.json()` unconditionally, so a
 *     401 looked like a verification result with no trust score.
 *   · `batchVerify` / `verifyWebhook` call the API normally. They were briefly gated
 *     behind NotDeployedError while those backend functions were undeployed; both were
 *     deployed on 2026-08-09 (re-probed: 401 "Missing x-api-key header", i.e. present
 *     and auth-gated, rather than 404 "not found or not deployed"), so the gate is
 *     gone. NotDeployedError is still thrown if the API itself reports a function as
 *     not deployed.
 *
 * Requires Node 18+ (global fetch). No dependencies.
 */

'use strict';

const DEFAULT_BASE_URL = 'https://aether.sf2x.com/api/functions';

/**
 * Backend functions known to be undeployed. Empty: batchVerify and webhookVerify were
 * deployed on 2026-08-09, so nothing is pre-emptively blocked. Kept as the single place
 * to list a function again if one is ever withdrawn.
 */
const NOT_DEPLOYED = new Set();

class AetherError extends Error {
  constructor(message, status = null, body = null) {
    super(message);
    this.name = 'AetherError';
    this.status = status;
    this.body = body;
  }
}

class NotDeployedError extends AetherError {
  constructor(message) {
    super(message, 404);
    this.name = 'NotDeployedError';
  }
}

class AetherClient {
  /**
   * @param {string} [apiKey] falls back to process.env.AETHER_API_KEY
   * @param {{baseUrl?: string, timeoutMs?: number, fetchImpl?: Function}} [opts]
   */
  constructor(apiKey = '', opts = {}) {
    const envKey =
      typeof process !== 'undefined' && process.env ? process.env.AETHER_API_KEY : '';
    this.apiKey = apiKey || envKey || '';
    this.baseUrl = String(opts.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.timeoutMs = opts.timeoutMs || 60000;
    this.fetchImpl = opts.fetchImpl || (typeof fetch === 'function' ? fetch : null);

    this.headers = { 'Content-Type': 'application/json' };
    if (this.apiKey) this.headers['x-api-key'] = this.apiKey;
  }

  async _post(fn, payload) {
    if (NOT_DEPLOYED.has(fn)) {
      throw new NotDeployedError(
        `The '${fn}' backend function is not deployed on the Aether app ` +
          `(live-probed 2026-08-09). Deploy it in Base44 before calling this. ` +
          `See docs/API_REFERENCE.md -> Endpoint status.`,
      );
    }
    if (!this.fetchImpl) {
      throw new AetherError('no fetch implementation available — Node 18+ is required');
    }

    const url = `${this.baseUrl}/${fn}`;
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), this.timeoutMs) : null;

    let res;
    try {
      res = await this.fetchImpl(url, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(payload),
        ...(controller ? { signal: controller.signal } : {}),
      });
    } catch (err) {
      const reason = err && err.name === 'AbortError' ? `timed out after ${this.timeoutMs}ms` : String(err && err.message ? err.message : err);
      throw new AetherError(`request to ${url} failed: ${reason}`);
    } finally {
      if (timer) clearTimeout(timer);
    }

    let body = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }

    // Surface a genuine "not deployed" from the API as NotDeployedError, rather than
    // pre-emptively blocking the call.
    if (res.status === 404 && /not deployed|not found/i.test(JSON.stringify(body))) {
      throw new NotDeployedError(
        `The '${fn}' backend function is not deployed on the Aether app: ${JSON.stringify(body)}`,
      );
    }

    if (!res.ok) {
      const hint = res.status === 401 && !this.apiKey ? ' (no API key was provided)' : '';
      throw new AetherError(
        `Aether API returned ${res.status}${hint}: ${JSON.stringify(body)}`,
        res.status,
        body,
      );
    }
    if (!body) throw new AetherError('Aether API returned a non-JSON response', res.status);
    return body;
  }

  /** Verify a single text response for hallucinations. */
  async verify(text) {
    if (!text || !String(text).trim()) throw new TypeError('text is required');
    return this._post('verifyResponse', { text });
  }

  /**
   * Verify up to 50 texts in one request.
   * COST: the tribunal runs once PER TEXT, so a 50-text batch costs ~50x a single
   * verify. Budget accordingly.
   */
  async batchVerify(texts, options = {}) {
    if (!Array.isArray(texts) || texts.length === 0) {
      throw new TypeError('texts must be a non-empty array');
    }
    if (texts.length > 50) throw new TypeError('batchVerify accepts at most 50 texts');
    return this._post('batchVerify', { texts, options });
  }

  /** Verify text and POST the result to a webhook. */
  async verifyWebhook(text, webhookUrl, verificationId = '') {
    if (!text || !String(text).trim()) throw new TypeError('text is required');
    if (!webhookUrl) throw new TypeError('webhookUrl is required');
    return this._post('webhookVerify', {
      text,
      webhook_url: webhookUrl,
      verification_id: verificationId,
    });
  }

  /**
   * Quick helper — just the trust score. Returns 0 when none was reported.
   * A missing score is NOT evidence of trustworthiness: callers gating on this
   * should treat 0 as a failure, not as unknown.
   */
  async getTrustScore(text) {
    const result = await this.verify(text);
    return typeof result.trust_score === 'number' ? result.trust_score : 0;
  }

  /** True when the text meets or exceeds the trust threshold. */
  async isVerified(text, threshold = 80) {
    return (await this.getTrustScore(text)) >= threshold;
  }
}

// Support BOTH documented import styles:
//   const AetherClient = require('./aether_sdk');
//   const { AetherClient } = require('./aether_sdk');
module.exports = AetherClient;
module.exports.AetherClient = AetherClient;
module.exports.AetherError = AetherError;
module.exports.NotDeployedError = NotDeployedError;
module.exports.DEFAULT_BASE_URL = DEFAULT_BASE_URL;
