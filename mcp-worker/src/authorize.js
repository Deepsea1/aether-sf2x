/**
 * defaultHandler — owns everything the OAuthProvider hands to the application,
 * which for us is only the /authorize approval page. Everything else the provider
 * routes down here (it shouldn't, in practice) gets a 404.
 *
 * The approval page is a self-contained AS consent screen gated by a single shared
 * secret (env.AETHER_OAUTH_SECRET). Only someone who knows the secret can approve
 * an OAuth client. No external IdP. Google-SSO delegation is a future upgrade:
 * replace the secret check below with an OIDC redirect and keep the same
 * completeAuthorization() tail.
 *
 * Security notes:
 *  - The POST is rate-limited per-IP as a brute-force guard on the secret.
 *  - The secret is compared in constant time.
 *  - If AETHER_OAUTH_SECRET is unset we fail closed (no approval possible), so an
 *    empty submitted secret can never match an empty configured secret.
 */

import { constantTimeEqual } from './auth.js';
import { checkRateLimit } from './ratelimit.js';

export const defaultHandler = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname !== '/authorize') {
      return new Response('Not found', { status: 404 });
    }
    if (request.method === 'GET') return renderApprovalPage(request, env, null);
    if (request.method === 'POST') return handleApprovalPost(request, env, ctx);
    return new Response('Method Not Allowed', { status: 405 });
  },
};

async function parseOrError(request, env) {
  // Returns { oauthRequest } on success, or { errorResponse } to return directly.
  try {
    const oauthRequest = await env.OAUTH_PROVIDER.parseAuthRequest(request);
    return { oauthRequest };
  } catch (error) {
    // AuthorizationError is exported by the library; we duck-type it to avoid a
    // hard import dependency on its class in this JS module.
    const redirectUri = error && error.redirectUri;
    if (!redirectUri) {
      const desc = (error && (error.description || error.message)) || 'invalid_request';
      return { errorResponse: new Response(desc, { status: 400 }) };
    }
    const redirect = new URL(redirectUri);
    redirect.searchParams.set('error', (error && error.code) || 'invalid_request');
    if (error.description) redirect.searchParams.set('error_description', error.description);
    if (error.state) redirect.searchParams.set('state', error.state);
    if (error.issuer) redirect.searchParams.set('iss', error.issuer);
    return { errorResponse: Response.redirect(redirect.toString(), 302) };
  }
}

async function renderApprovalPage(request, env, errorMsg) {
  const { oauthRequest, errorResponse } = await parseOrError(request, env);
  if (errorResponse) return errorResponse;

  let client = null;
  try {
    client = await env.OAUTH_PROVIDER.lookupClient(oauthRequest.clientId);
  } catch {
    // CIMD fetch failure or similar — treat as unknown client.
    client = null;
  }

  // CIMD consent shows the client HOST derived from the client_id URL, not a
  // self-asserted name. Fall back to a registered clientName for DCR clients.
  let clientLabel;
  try {
    clientLabel = new URL(oauthRequest.clientId).host;
  } catch {
    clientLabel = (client && client.clientName) || oauthRequest.clientId || 'unknown client';
  }

  const scopes = Array.isArray(oauthRequest.scope) && oauthRequest.scope.length
    ? oauthRequest.scope
    : ['mcp:use'];

  const configured = !!(env.AETHER_OAUTH_SECRET || '').trim();
  const action = '/authorize' + new URL(request.url).search;
  const html = approvalHtml({ clientLabel, scopes, action, errorMsg, configured });
  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

async function handleApprovalPost(request, env, ctx) {
  const ip = request.headers.get('cf-connecting-ip') || 'noip';

  // Brute-force guard on the shared secret.
  const rl = await checkRateLimit(env, 'authz', ip);
  if (rl.limited) {
    return new Response('Too Many Requests', {
      status: 429,
      headers: { 'Retry-After': String(rl.retryAfter) },
    });
  }

  // Fail closed if no secret is configured — never allow an approval.
  const expected = (env.AETHER_OAUTH_SECRET || '').trim();
  if (!expected) {
    return renderApprovalPage(request, env, 'Approval is not configured on this server.');
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return renderApprovalPage(request, env, 'Invalid form submission.');
  }
  const submitted = String(form.get('secret') || '');
  const ok = submitted ? await constantTimeEqual(submitted, expected) : false;
  if (!ok) {
    return renderApprovalPage(request, env, 'Incorrect secret. Try again.');
  }

  // Re-parse (and re-validate) the OAuth request before completing it.
  const { oauthRequest, errorResponse } = await parseOrError(request, env);
  if (errorResponse) return errorResponse;

  let clientName = oauthRequest.clientId;
  try {
    const client = await env.OAUTH_PROVIDER.lookupClient(oauthRequest.clientId);
    if (client && client.clientName) clientName = client.clientName;
  } catch { /* non-fatal */ }

  const grantedScopes = Array.isArray(oauthRequest.scope) && oauthRequest.scope.length
    ? oauthRequest.scope
    : ['mcp:use'];

  const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
    request: oauthRequest,
    userId: 'owner',
    metadata: { clientName },
    scope: grantedScopes,
    props: { userId: 'owner' },
  });

  return Response.redirect(redirectTo, 302);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function approvalHtml({ clientLabel, scopes, action, errorMsg, configured }) {
  const scopeList = scopes.map((s) => `<li><code>${escapeHtml(s)}</code></li>`).join('');
  const err = errorMsg
    ? `<p class="err" role="alert">${escapeHtml(errorMsg)}</p>`
    : '';
  const notConfigured = configured
    ? ''
    : `<p class="err">Server is missing <code>AETHER_OAUTH_SECRET</code>; approval is disabled.</p>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Authorize Aether MCP</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 0;
    display: grid; place-items: center; min-height: 100vh; background: #0b0d12; color: #e8ecf1; }
  .card { width: min(92vw, 460px); background: #141822; border: 1px solid #232b3a;
    border-radius: 14px; padding: 28px 30px; box-shadow: 0 10px 40px rgba(0,0,0,.4); }
  h1 { font-size: 1.15rem; margin: 0 0 4px; }
  p.sub { margin: 0 0 18px; color: #9aa6b6; font-size: .9rem; }
  .who { background: #0f1420; border: 1px solid #232b3a; border-radius: 10px; padding: 12px 14px; margin-bottom: 16px; }
  .who b { color: #cfe1ff; }
  ul { margin: 6px 0 0; padding-left: 20px; color: #b9c4d3; font-size: .88rem; }
  label { display: block; font-size: .85rem; margin: 4px 0 6px; color: #b9c4d3; }
  input[type=password] { width: 100%; box-sizing: border-box; padding: 11px 12px; border-radius: 9px;
    border: 1px solid #2b3446; background: #0f1420; color: #e8ecf1; font-size: 1rem; }
  .row { display: flex; gap: 10px; margin-top: 18px; }
  button { flex: 1; padding: 11px 14px; border-radius: 9px; border: 1px solid transparent; font-size: .95rem;
    cursor: pointer; }
  .approve { background: #3b82f6; color: #fff; }
  .approve:disabled { background: #2a3550; opacity: .5; cursor: not-allowed; }
  .deny { background: transparent; color: #b9c4d3; border-color: #2b3446; }
  .err { color: #ff8f8f; font-size: .85rem; margin: 0 0 14px; }
  code { background: #0f1420; padding: 1px 6px; border-radius: 6px; }
</style>
</head>
<body>
  <main class="card">
    <h1>Authorize connection</h1>
    <p class="sub">Aether MCP — SF2X Truth Tribunal</p>
    ${err}
    ${notConfigured}
    <div class="who">
      <div><b>${escapeHtml(clientLabel)}</b> wants to connect.</div>
      <div style="margin-top:8px;font-size:.85rem;color:#9aa6b6;">Requested access:</div>
      <ul>${scopeList}</ul>
    </div>
    <form method="POST" action="${escapeHtml(action)}" autocomplete="off">
      <label for="secret">Owner approval secret</label>
      <input id="secret" name="secret" type="password" required autofocus autocomplete="off" />
      <div class="row">
        <button class="approve" type="submit"${configured ? '' : ' disabled'}>Approve</button>
        <button class="deny" type="button" onclick="history.length>1?history.back():window.close()">Deny</button>
      </div>
    </form>
  </main>
</body>
</html>`;
}
