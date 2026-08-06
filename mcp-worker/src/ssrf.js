/**
 * SSRF guard — reject non-http(s) schemes and private/internal hostnames before
 * passing source URLs to the upstream verifier.
 *
 * Hardening note: the old `u.scheme === 'file:'` check was dead (the WHATWG `URL`
 * object has no `.scheme` property — only `.protocol`). The `u.protocol` http/https
 * allowlist below already blocks `file:` and every other scheme, so the dead line
 * is removed and the real allowlist is kept.
 */
export function isSafeUrl(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost')) return false;
  if (host === '::1' || host === '[::1]') return false;
  // IPv4 private ranges
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [parseInt(m[1]), parseInt(m[2])];
    if (a === 10) return false;
    if (a === 127) return false;
    if (a === 0) return false;
    if (a === 169 && b === 254) return false; // link-local
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
  }
  return true;
}
