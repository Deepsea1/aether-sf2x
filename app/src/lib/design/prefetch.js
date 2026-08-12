// Route prefetch on intent — the module for the route you are about to ask for, fetched
// while your finger is still moving.
//
// THE SHAPE OF THE PROBLEM. Every page in this app is a `React.lazy` chunk (App.jsx). That
// is the right call for payload, and it has one cost: the chunk request does not start
// until the route has already changed, so the first frame of every navigation is a spinner
// that exists purely because of network latency. Prefetching on *intent* — hover, focus,
// touch-start — starts that request 100–400 ms earlier, which is usually the entire
// perceived wait. Nothing is loaded speculatively: a route is fetched only once a human has
// pointed at a link that goes there.
//
// WHY A GLOB AND NOT A LIST OF `import()` CALLS. `import.meta.glob` resolves to the same
// module ids as App.jsx's `import('@/pages/X')`, so Rollup emits ONE chunk per page and this
// file adds none. It is also missing-file-safe: a page that has not been written yet simply
// has no key, and `prefetchRoute` becomes a no-op instead of a build error — the same reason
// App.jsx globs the three showcase pages. `false` for eager: these are lazy loaders, never
// inlined.
//
// WHY IT REFUSES TO RUN SOMETIMES. Prefetch spends someone else's bytes. On a metered or
// slow connection that is a real cost for a guess, so `Save-Data` and 2g/slow-2g opt out
// entirely, and everything else waits for an idle callback so a prefetch can never contend
// with the render it is trying to make feel fast.
//
// This module is also where route metadata lives, because route → chunk and route → title
// are the same fact and must not be written down twice.

/** Lazy loaders for every page, keyed by `/src/pages/<Name>.jsx`. Adds no chunks. */
const PAGE_LOADERS = import.meta.glob('/src/pages/*.jsx');

/**
 * The routes reachable from navigation, with the page module each one mounts and the title
 * it should give the document. Kept flat and literal: this is a lookup table, not a router.
 * A path that is absent is simply not prefetchable — never an error, never a guess.
 */
export const ROUTES = [
  // — the showcase surfaces —
  { path: '/cosmos', page: 'Cosmos', title: 'Cosmos — the evidence lens' },
  { path: '/proof', page: 'ProofTheater', title: 'Proof Theater — watch the maths' },
  { path: '/live', page: 'LiveTribunal', title: 'Live Tribunal' },

  // — verify —
  { path: '/', page: 'Landing', title: 'Aether — the truth layer for AI' },
  { path: '/playground', page: 'Playground', title: 'Playground' },
  { path: '/compare', page: 'Compare', title: 'Compare' },
  { path: '/multi-model', page: 'MultiModelCompare', title: 'Multi-model comparison' },
  { path: '/arena', page: 'RedTeamArena', title: 'Red-team arena' },
  { path: '/hall-of-fame', page: 'HallOfFame', title: 'Hall of fame' },
  { path: '/warrant-proof', page: 'WarrantProof', title: 'Warrant proof' },
  { path: '/public/claims', page: 'PublicClaims', title: 'Public claims' },

  // — rankings —
  { path: '/leaderboard', page: 'Showcase', title: 'Showcase' },
  { path: '/benchmark', page: 'Benchmark', title: 'Benchmark' },
  { path: '/registry', page: 'Registry', title: 'Transparency log' },
  { path: '/methodology', page: 'Methodology', title: 'Methodology' },

  // — developers —
  { path: '/api-docs', page: 'ApiDocs', title: 'API docs' },
  { path: '/mcp', page: 'McpServer', title: 'MCP server' },
  { path: '/warrant-spec', page: 'WarrantSpec', title: 'Warrant spec' },
  { path: '/warrant-verifier', page: 'WarrantVerifier', title: 'Verifier spec' },
  { path: '/github-action', page: 'GitHubAction', title: 'GitHub Action' },
  { path: '/github-pr-verify', page: 'GitHubPrVerify', title: 'PR verify' },
  { path: '/extension', page: 'Extension', title: 'Browser extension' },
  { path: '/embed', page: 'Embed', title: 'Embed a badge' },

  // — company —
  { path: '/about', page: 'About', title: 'About' },
  { path: '/contact', page: 'Contact', title: 'Contact' },
  { path: '/pricing', page: 'Pricing', title: 'Pricing' },
  { path: '/terms', page: 'Terms', title: 'Terms' },
  { path: '/privacy', page: 'Privacy', title: 'Privacy' },

  // — the signed-in shell —
  { path: '/console', page: 'AskHub', title: 'Ask' },
  { path: '/setup', page: 'GettingStarted', title: 'Get started' },
  { path: '/trust-center', page: 'TrustCenterHub', title: 'Trust Center' },
  { path: '/portal', page: 'PortalHub', title: 'Account' },
  { path: '/developer', page: 'DeveloperHub', title: 'Developer hub' },
  { path: '/enterprise', page: 'Enterprise', title: 'Audit' },
  { path: '/collective', page: 'Collective', title: 'Red team' },
  { path: '/owner', page: 'OwnerDashboard', title: 'Owner dashboard' },
  { path: '/claims', page: 'Claims', title: 'Claims registry' },
  { path: '/guide', page: 'Guide', title: 'Guide' },
  { path: '/integration-support', page: 'IntegrationSupport', title: 'Agent' },
  { path: '/login', page: 'Login', title: 'Sign in' },
  { path: '/register', page: 'Register', title: 'Create an account' },
];

const BY_PATH = new Map(ROUTES.map((r) => [r.path, r]));

const BRAND = 'Aether by SF2X';

/**
 * The document title for a pathname. Unknown paths return the brand alone rather than a
 * guessed title — a wrong title is worse than a generic one, especially for a screen
 * reader that reads it aloud on every navigation.
 * @param {string} pathname
 * @returns {string}
 */
export function titleFor(pathname) {
  const route = BY_PATH.get(normalize(pathname));
  return route ? `${route.title} · ${BRAND}` : BRAND;
}

/** Strip a trailing slash (but keep the root) and drop any query/hash. */
function normalize(pathname) {
  if (typeof pathname !== 'string') return '/';
  const clean = pathname.split('?')[0].split('#')[0];
  if (clean.length > 1 && clean.endsWith('/')) return clean.slice(0, -1);
  return clean || '/';
}

// ─── the policy: when we are allowed to spend someone's bytes ──────────────────────────

let policy = null;

/**
 * True when prefetching is polite here. Read once and cached — `connection` can change, but
 * re-reading it on every hover would be more work than the prefetch it guards.
 * @returns {boolean}
 */
export function prefetchAllowed() {
  if (policy !== null) return policy;
  if (typeof navigator === 'undefined' || typeof document === 'undefined') {
    policy = false;
    return policy;
  }
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (conn) {
    if (conn.saveData) { policy = false; return policy; }
    if (/^(slow-)?2g$/.test(String(conn.effectiveType || ''))) { policy = false; return policy; }
  }
  policy = true;
  return policy;
}

/** Test seam + a way for a caller to hard-disable prefetch. */
export function setPrefetchAllowed(value) {
  policy = value === null ? null : !!value;
}

const requested = new Set();

const idle = (fn) => {
  if (typeof window === 'undefined') return;
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(fn, { timeout: 1200 });
  else setTimeout(fn, 1);
};

/**
 * Fetch the chunk for a route, at most once per session, never on a metered connection.
 * Failures are swallowed on purpose: a prefetch that fails must be invisible, because the
 * real navigation will retry it and report the error itself.
 *
 * @param {string} pathname
 * @returns {boolean} whether a fetch was actually scheduled — useful in tests, ignorable otherwise
 */
export function prefetchRoute(pathname) {
  const path = normalize(pathname);
  if (requested.has(path)) return false;

  const route = BY_PATH.get(path);
  if (!route) return false;

  const load = PAGE_LOADERS[`/src/pages/${route.page}.jsx`];
  if (!load) return false;                    // page not on disk yet — silently nothing

  if (!prefetchAllowed()) return false;

  requested.add(path);
  idle(() => { try { load().catch(() => {}); } catch { /* never let a prefetch throw */ } });
  return true;
}

/**
 * Handlers to spread onto a link so it warms its own destination.
 *
 *   <Link to="/proof" {...prefetchProps('/proof')}>Proof</Link>
 *
 * `onFocus` is not decoration — it is what makes this work for keyboard and switch users,
 * who never produce a hover. `onTouchStart` buys the ~90 ms between finger-down and the
 * click that follows it.
 *
 * @param {string} pathname
 * @returns {{onMouseEnter: Function, onFocus: Function, onTouchStart: Function}}
 */
export function prefetchProps(pathname) {
  const warm = () => { prefetchRoute(pathname); };
  return { onMouseEnter: warm, onFocus: warm, onTouchStart: warm };
}

/**
 * One delegated listener for the whole document, so every internal link in the app warms on
 * intent — including links inside pages this module has never heard of and cannot edit.
 * Capture phase + passive + read-only: it inspects the event target and never touches it,
 * so it cannot interfere with React's own handlers or with a link's default behaviour.
 *
 * Call once, from the app entry. Returns a teardown for symmetry and tests.
 *
 * @returns {() => void}
 */
export function installLinkPrefetch() {
  if (typeof document === 'undefined') return () => {};
  if (!prefetchAllowed()) return () => {};

  const onIntent = (event) => {
    const target = event.target;
    if (!target || typeof target.closest !== 'function') return;
    const anchor = target.closest('a[href]');
    if (!anchor) return;
    const href = anchor.getAttribute('href');
    // Same-origin, in-app paths only. Never a mailto:, a hash jump, or another site.
    if (!href || !href.startsWith('/') || href.startsWith('//')) return;
    prefetchRoute(href);
  };

  const opts = { capture: true, passive: true };
  document.addEventListener('pointerover', onIntent, opts);
  document.addEventListener('focusin', onIntent, opts);
  document.addEventListener('touchstart', onIntent, opts);

  return () => {
    document.removeEventListener('pointerover', onIntent, opts);
    document.removeEventListener('focusin', onIntent, opts);
    document.removeEventListener('touchstart', onIntent, opts);
  };
}

export default {
  ROUTES, titleFor, prefetchRoute, prefetchProps, installLinkPrefetch,
  prefetchAllowed, setPrefetchAllowed,
};
