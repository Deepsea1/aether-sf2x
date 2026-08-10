// INLINED VERBATIM from ../../shared/sf2xCore.js (signature block only).
// The base44 CLI bundles each function standalone — relative imports cannot
// reach ../../shared/, so this function carries its own copy. sf2xCore.js
// remains the canonical source for every platform-authored function: if its
// signature functions change, re-sync this file before redeploying.

function pemBytes(pem) {
  const body = String(pem || '').replace(/-----BEGIN [^-]+-----|-----END [^-]+-----|\s/g, '');
  if (!body) return null;
  return Uint8Array.from(atob(body), (char) => char.charCodeAt(0));
}

function base64Url(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlBytes(value) {
  const base64 = String(value || '').replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((String(value || '').length + 3) % 4);
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

export function signatureScheme(stored) {
  if (String(stored || '').startsWith('sf2x_ed25519_')) return 'Ed25519';
  if (String(stored || '').startsWith('sf2x_sig_')) return 'HMAC-SHA256';
  return stored ? 'content-fingerprint' : 'none';
}

export async function generateSignature(content, signing = null) {
  const text = String(content ?? '');
  const options = signing && typeof signing === 'object' ? signing : { hmacKey: signing };
  const enc = new TextEncoder();
  if (options.ed25519PrivateKey) {
    const key = await crypto.subtle.importKey('pkcs8', pemBytes(options.ed25519PrivateKey), { name: 'Ed25519' }, false, ['sign']);
    return 'sf2x_ed25519_' + base64Url(await crypto.subtle.sign({ name: 'Ed25519' }, key, enc.encode(text)));
  }
  if (options.hmacKey) {
    const key = await crypto.subtle.importKey('raw', enc.encode(String(options.hmacKey)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return 'sf2x_sig_' + base64Url(await crypto.subtle.sign('HMAC', key, enc.encode(text)));
  }
  const fnv = (seed) => {
    let h = seed >>> 0;
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(16).padStart(8, '0');
  };
  return `sf2x_${fnv(2166136261)}${fnv(1469598103)}`;
}

export async function verifySignature(content, stored, signing = null) {
  const options = signing && typeof signing === 'object' ? signing : { hmacKey: signing };
  const scheme = signatureScheme(stored);
  if (scheme === 'Ed25519') {
    if (!options.ed25519PublicKey) return false;
    const key = await crypto.subtle.importKey('spki', pemBytes(options.ed25519PublicKey), { name: 'Ed25519' }, false, ['verify']);
    return crypto.subtle.verify({ name: 'Ed25519' }, key, base64UrlBytes(String(stored).slice('sf2x_ed25519_'.length)), new TextEncoder().encode(String(content ?? '')));
  }
  if (scheme === 'HMAC-SHA256') return options.hmacKey ? (await generateSignature(content, { hmacKey: options.hmacKey })) === stored : false;
  return scheme === 'content-fingerprint' ? (await generateSignature(content, null)) === stored : false;
}
