/**
 * OAuth provider config — the AS/RS. We use the library ONLY for the OAuth 2.1
 * authorization server + resource server (RFC 9728 PRM, RFC 8414 AS metadata, the
 * 401 + WWW-Authenticate challenge, /authorize + /token, S256 PKCE, refresh
 * rotation, encrypted token storage). The three MCP tools stay hand-rolled in
 * mcp-core.js and are reached through `apiHandler`.
 *
 * The canonical OAuth resource (audience) is `${MCP_PUBLIC_URL}/mcp`. Register the
 * connector in claude.ai as that exact URL — the bare origin will not line up with
 * the audience binding. Legacy static clients keep pointing at the bare origin `/`;
 * that divergence is intentional and handled by the outer wrapper in worker.js.
 */

import { OAuthProvider } from '@cloudflare/workers-oauth-provider';
import { mcpApiHandler } from './mcp-core.js';
import { defaultHandler } from './authorize.js';

// Stable public origin of this worker. Overridable via the MCP_PUBLIC_URL var so
// the canonical resource has a single source of truth.
const DEFAULT_PUBLIC_URL = 'https://aether-mcp.campiper84.workers.dev';

export function buildProvider(env) {
  const PUBLIC = ((env && env.MCP_PUBLIC_URL) || DEFAULT_PUBLIC_URL).replace(/\/+$/, '');

  return new OAuthProvider({
    apiRoute: '/mcp',
    apiHandler: mcpApiHandler, // { fetch } → runMcp(req, env, ctxWithProps, oauth:<userId>)
    defaultHandler, // /authorize approval page (shared-secret gated)

    authorizeEndpoint: '/authorize',
    tokenEndpoint: '/token',

    scopesSupported: ['mcp:use'],

    resourceMetadata: {
      resource: `${PUBLIC}/mcp`, // canonical audience — path included, no trailing slash
      authorization_servers: [PUBLIC], // issuer == this worker origin
      scopes_supported: ['mcp:use'],
      bearer_methods_supported: ['header'],
      resource_name: 'Aether MCP (SF2X Truth Tribunal)',
    },

    // CIMD so claude.ai self-identifies without DCR minting a client per connection.
    // Requires the global_fetch_strictly_public compatibility flag (set in wrangler.toml).
    clientIdMetadataDocumentEnabled: true,
    // DCR fallback for clients that don't support CIMD.
    clientRegistrationEndpoint: '/register',

    accessTokenTTL: 3600, // refreshTokenTTL defaults to 30d with rotation
  });
}
