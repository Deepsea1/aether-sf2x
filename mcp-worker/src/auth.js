/**
 * Auth helpers — the legacy static bearer path (preserved) plus the constant-time
 * compare used for BOTH the static bearer and the /authorize shared secret.
 *
 * Hardening:
 *  - FAIL CLOSED: when no AETHER_MCP_TOKEN is configured we reject, instead of the
 *    old "no token set → allow all" dev fail-open. The only escape hatch is an
 *    explicit ALLOW_INSECURE==='true' env var, which must NEVER be set in prod.
 *  - Constant-time compare: both sides are SHA-256 digested and the fixed 32-byte
 *    digests are XOR-compared, so neither the value nor its length leaks via timing.
 */

async function sha256Bytes(str) {
  const data = new TextEncoder().encode(String(str));
  const buf = await crypto.subtle.digest('SHA-256', data);
  return new Uint8Array(buf);
}

export async function sha256Hex(str) {
  const bytes = await sha256Bytes(str);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
  return hex;
}

/**
 * Timing-safe string equality. Hashing both sides to a fixed 32 bytes means the
 * comparison length is constant and independent of the inputs' lengths/content.
 */
export async function constantTimeEqual(a, b) {
  const [ha, hb] = await Promise.all([sha256Bytes(a), sha256Bytes(b)]);
  let diff = 0;
  for (let i = 0; i < 32; i++) diff |= ha[i] ^ hb[i];
  return diff === 0;
}

function bearerToken(req) {
  const auth = req.headers.get('Authorization') || '';
  return auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
}

/**
 * Validate the legacy static MCP bearer token.
 * Returns false (fail closed) when AETHER_MCP_TOKEN is unset — UNLESS
 * env.ALLOW_INSECURE === 'true' (a local wrangler-dev-only escape hatch that is
 * never set in production).
 */
export async function validStaticBearer(req, env) {
  const expected = (env.AETHER_MCP_TOKEN || '').trim();
  if (!expected) {
    // No static token configured. Fail closed in prod; open only for local dev.
    return env.ALLOW_INSECURE === 'true';
  }
  const token = bearerToken(req);
  if (!token) return false;
  return await constantTimeEqual(token, expected);
}

/**
 * Stable, non-reversible identity for the presented static token, used as a
 * rate-limit key. A short hash prefix is enough to bucket a caller without
 * storing the raw token anywhere.
 */
export async function staticIdentity(req) {
  const token = bearerToken(req);
  if (!token) return 't:anon';
  const hex = await sha256Hex(token);
  return 't:' + hex.slice(0, 16);
}
