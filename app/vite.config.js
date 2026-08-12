import base44 from "@base44/vite-plugin"
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// VENDOR SPLITTING — deliberate, minimal, and measured at every step.
//
// THE PROBLEM. Every page is already a lazy chunk, but every page's *dependencies* were
// hoisted into one 531 kB entry chunk the browser had to download and parse before painting
// anything. One chunk is also one cache key: a one-line app change re-downloaded React, the
// router, framer-motion and the Base44 SDK along with it.
//
// THE RULE THIS FILE ENCODES, learned the expensive way (numbers below are real, from builds
// run while writing it):
//
//     Group a package only when the entry needs essentially ALL of it.
//     Otherwise leave it to Rollup, which already splits it per route.
//
// Grouping is not free. A named chunk is indivisible, so the moment the entry needs one
// module inside it, the entry statically imports the WHOLE thing. For `react` that is fine —
// the shell uses all of React. For `@radix-ui/*` and `lucide-react` it is a disaster: the
// shell uses three primitives and twenty icons, while the codebase as a whole uses dozens of
// each, and Rollup was already handing every lazy route exactly its own slice.
//
//   critical path = index.html's script + every modulepreload + the stylesheet
//     baseline, no manualChunks .................................  641 kB
//     + vendor-ui / vendor-icons / vendor-util .................  993 kB  (+55%, rejected)
//     + naming lazy-only groups (charts, pdf, raster) ..........  1.09 MB (rejected)
//     final, only genuinely entry-wide packages named ..........  see below
//
// Entry-chunk size is the symptom. Bytes before first paint is the disease, and it is
// possible to "fix" the first while making the second much worse — which is exactly what the
// two rejected attempts did, and exactly what the guard at the bottom of this file now
// catches automatically instead of leaving it to somebody's afternoon.
//
// react + react-dom + scheduler + react-router stay in ONE chunk on purpose. Splitting a
// renderer from its reconciler, or a router from React, is the classic way to end up with two
// copies of a context and a blank page that only appears in production.

/** Rules naming a scope, or ending in `-`/`/`, match by prefix. Everything else is exact. */
const GROUPS = [
  // Never used by any shipped page. Named ONLY so it has a stable identity if someone adds
  // it — the guard below is what actually keeps it off the critical path.
  ['vendor-three', ['three', 'three-stdlib', '@react-three']],

  // The four packages the shell genuinely uses end to end. Splitting these removes no bytes
  // from a cold first visit; it makes them cacheable across deploys and fetchable in
  // parallel, and it takes the entry chunk from 531 kB to roughly a tenth of that.
  ['vendor-react', ['react', 'react-dom', 'scheduler', 'react-router', 'react-router-dom',
    '@remix-run', 'use-sync-external-store', 'react-is', 'object-assign', 'prop-types']],
  ['vendor-motion', ['framer-motion', 'motion-dom', 'motion-utils', '@motionone']],
  ['vendor-base44', ['@base44']],
  ['vendor-query', ['@tanstack']],

  // EVERYTHING ELSE IS DELIBERATELY ABSENT — @radix-ui, lucide-react, recharts, jspdf,
  // html2canvas, dompurify, moment, lodash, date-fns, react-markdown, quill, leaflet. Each
  // one was tried and each one made first paint worse, because each is reached from lazy
  // routes and Rollup was already placing it there correctly.
];

/** The package a module id belongs to, e.g. `@radix-ui/react-dialog` or `d3-scale`. */
function packageOf(id) {
  const path = id.replace(/\\/g, '/');
  const marker = path.lastIndexOf('node_modules/');
  if (marker === -1) return null;
  let rest = path.slice(marker + 'node_modules/'.length);
  if (rest.startsWith('.pnpm/')) {
    const nested = rest.indexOf('node_modules/');
    if (nested === -1) return null;
    rest = rest.slice(nested + 'node_modules/'.length);
  }
  const parts = rest.split('/');
  return parts[0].startsWith('@') ? `${parts[0]}/${parts[1] || ''}` : parts[0];
}

const isPrefixRule = (rule) => rule.startsWith('@') || rule.endsWith('-') || rule.endsWith('/');

function manualChunks(id) {
  const pkg = packageOf(id);
  if (!pkg) return undefined;
  for (const [chunk, rules] of GROUPS) {
    for (const rule of rules) {
      if (isPrefixRule(rule) ? pkg.startsWith(rule) : pkg === rule) return chunk;
    }
  }
  // Unrecognised dependency: hand it back to Rollup, which co-locates it with whoever uses
  // it. A good automatic decision beats a confident manual one.
  return undefined;
}

// ── THE CRITICAL-PATH GUARD ────────────────────────────────────────────────────────────────
//
// Checks PACKAGES, not chunk names, so it keeps working no matter how the groups above are
// rearranged (or deleted). `three` is a hard build error: it is a dependency of this project
// that no shipped page imports, and the only way it reaches first paint is by accident —
// somebody adding a static `import * as THREE` to a shell component instead of loading the
// 3D view lazily. The rest are warnings, because a future page may legitimately need a chart
// in the shell and failing that build would be a worse bug than the regression it guards.
const FORBIDDEN_PACKAGES = ['three'];
const DISCOURAGED_PACKAGES = ['recharts', 'jspdf', 'html2canvas', 'quill', 'leaflet', 'moment'];

function criticalPathGuard() {
  return {
    name: 'aether:critical-path-guard',
    generateBundle(_options, bundle) {
      // Walk STATIC imports only, from every entry. `dynamicImports` is deliberately not
      // followed: a dynamic import is precisely where these packages are supposed to live.
      const reached = new Set();
      const queue = Object.values(bundle)
        .filter((c) => c.type === 'chunk' && c.isEntry)
        .map((c) => c.fileName);
      while (queue.length) {
        const file = queue.pop();
        if (reached.has(file)) continue;
        reached.add(file);
        const chunk = bundle[file];
        if (!chunk || chunk.type !== 'chunk') continue;
        for (const next of chunk.imports) queue.push(next);
      }

      const packages = new Set();
      const bytesByPackage = new Map();
      for (const file of reached) {
        const chunk = bundle[file];
        if (!chunk || chunk.type !== 'chunk') continue;
        for (const moduleId of chunk.moduleIds || []) {
          const pkg = packageOf(moduleId);
          if (!pkg) continue;
          packages.add(pkg);
          const size = chunk.modules?.[moduleId]?.renderedLength || 0;
          bytesByPackage.set(pkg, (bytesByPackage.get(pkg) || 0) + size);
        }
      }

      const kb = (pkg) => `${Math.round((bytesByPackage.get(pkg) || 0) / 1024)} kB`;

      for (const pkg of FORBIDDEN_PACKAGES) {
        if (!packages.has(pkg)) continue;
        this.error(
          `[critical-path-guard] "${pkg}" (${kb(pkg)}) is statically reachable from the entry ` +
          `chunk, so every visitor downloads it before first paint. It belongs behind a dynamic ` +
          `import(). Find the static import that pulled it in and make the consumer lazy.`,
        );
      }
      for (const pkg of DISCOURAGED_PACKAGES) {
        if (!packages.has(pkg)) continue;
        this.warn(
          `[critical-path-guard] "${pkg}" (${kb(pkg)}) entered the entry chunk's static graph. ` +
          `That is a real first-paint cost for every visitor — confirm it is intended.`,
        );
      }
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    base44({
      // Support for legacy code that imports the base44 SDK with @/integrations, @/entities, etc.
      // can be removed if the code has been updated to use the new SDK imports from @base44/sdk
      legacySDKImports: process.env.BASE44_LEGACY_SDK_IMPORTS === 'true',
      hmrNotifier: true,
      navigationNotifier: true,
      analyticsTracker: true,
      visualEditAgent: true
    }),
    react(),
    criticalPathGuard(),
  ],
  build: {
    // Left at Rollup's default on purpose. Raising it would silence the warning without
    // fixing anything, and the warning is the only automatic signal that a chunk has grown.
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: { manualChunks },
    },
  },
});
