/**
 * SSRF guard — reject non-http(s) schemes, embedded credentials, and
 * private/internal hosts before passing outbound URLs (verifier sources, alert
 * webhooks) to fetch.
 *
 * Hardening note: the old `u.scheme === 'file:'` check was dead (the WHATWG `URL`
 * object has no `.scheme` property — only `.protocol`). The `u.protocol` http/https
 * allowlist below already blocks `file:` and every other scheme, so the dead line
 * is removed and the real allowlist is kept.
 *
 * Residual gap (documented, not closable here): a public hostname whose DNS
 * resolves to a private address still passes — Workers expose no native DNS
 * resolution to check the answer against. Workers egress from the Cloudflare
 * edge rather than from inside a private network, which limits the practical
 * blast radius of that hole.
 */

/** Cloud metadata services reachable by name rather than IP literal.
 *  (169.254.169.254 itself is caught by the link-local range check below.) */
const METADATA_HOSTS = new Set(['metadata.google.internal', 'metadata', 'metadata.aws.internal']);

function isPrivateIPv4(ip) {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [parseInt(m[1]), parseInt(m[2])];
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true; // link-local, incl. 169.254.169.254 metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  if (a >= 224) return true; // multicast 224/4 + reserved 240/4 + broadcast
  return false;
}

function isPrivateIPv6(ip) {
  const v = ip.toLowerCase();
  if (v === '::1') return true; // loopback
  if (v === '::') return true; // unspecified
  const first = v.replace(/^:+/, '').split(':')[0] || '';
  if (first.startsWith('fc') || first.startsWith('fd')) return true; // unique-local fc00::/7
  if (first.startsWith('fe8') || first.startsWith('fe9') || first.startsWith('fea') || first.startsWith('feb')) return true; // link-local fe80::/10
  // IPv4-mapped ::ffff:a.b.c.d — the URL parser serializes the mapped quad as two
  // hex pieces (`[::ffff:127.0.0.1]` → `::ffff:7f00:1`), but accept the dotted
  // form too and check the embedded IPv4 against the same private ranges either way.
  const dotted = v.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (dotted) return isPrivateIPv4(dotted[1]);
  const hex = v.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const [hi, lo] = [parseInt(hex[1], 16), parseInt(hex[2], 16)];
    return isPrivateIPv4(`${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`);
  }
  return false;
}

export function isSafeUrl(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  // Embedded credentials in an outbound URL are a credential-leak vector — reject.
  if (u.username || u.password) return false;
  // Strip IPv6 brackets and any trailing dot so the literal/metadata checks below
  // see the bare host (`metadata.` resolves the same as `metadata`).
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (host === 'localhost' || host.endsWith('.localhost')) return false;
  if (METADATA_HOSTS.has(host)) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return !isPrivateIPv4(host);
  if (host.includes(':')) return !isPrivateIPv6(host);
  return true;
}
