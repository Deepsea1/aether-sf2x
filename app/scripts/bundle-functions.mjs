// Deploy bundler — the base44 CLI (v0.1.8) refuses ../../shared imports
// ("Relative imports can't reach outside the function"), while this codebase
// keeps backend logic in base44/shared/. This script inlines each function's
// relative imports with esbuild (npm:/base44:/jsr: stay external), stages a
// self-contained deploy tree, and copies entities/connectors/agents/dist.
// Usage:  node scripts/bundle-functions.mjs <out-dir>
//         cd <out-dir> && BASE44_APP_ID=... base44 functions deploy
// Proven 2026-08-10: 52/56 deployed (4 blocked only by the 50-function cap);
// platform pull-back confirmed the bundles verbatim.
// Pre-bundle every Base44 function into a self-contained entry.js so the
// v0.1.8 CLI (which refuses ../../shared imports) can deploy them.
// Relative imports are inlined; npm:/base44:/jsr: specifiers stay external.
import { build } from 'esbuild';
import { readdirSync, mkdirSync, writeFileSync, cpSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { fileURLToPath } from 'node:url';
const SRC = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const OUT = process.argv[2];
if (!OUT) { console.error('usage: node bundle-functions.mjs <out-dir>'); process.exit(1); }

const fnSrc = join(SRC, 'base44', 'functions');
const fnOut = join(OUT, 'base44', 'functions');
mkdirSync(fnOut, { recursive: true });

// Copy the non-function project resources the CLI deploys.
cpSync(join(SRC, 'base44', 'config.jsonc'), join(OUT, 'base44', 'config.jsonc'));
for (const d of ['entities', 'connectors', 'agents']) {
  if (existsSync(join(SRC, 'base44', d))) cpSync(join(SRC, 'base44', d), join(OUT, 'base44', d), { recursive: true });
}
if (existsSync(join(SRC, 'connectors'))) cpSync(join(SRC, 'connectors'), join(OUT, 'connectors'), { recursive: true });
if (existsSync(join(SRC, 'dist'))) cpSync(join(SRC, 'dist'), join(OUT, 'dist'), { recursive: true });

let ok = 0, failed = [];
for (const name of readdirSync(fnSrc)) {
  const dir = join(fnSrc, name);
  if (!statSync(dir).isDirectory()) continue;
  const entry = join(dir, 'entry.ts');
  if (!existsSync(entry)) { failed.push([name, 'no entry.ts']); continue; }
  try {
    const res = await build({
      entryPoints: [entry],
      bundle: true,
      format: 'esm',
      platform: 'neutral',
      target: 'esnext',
      write: false,
      logLevel: 'silent',
      external: ['npm:*', 'base44:*', 'jsr:*', 'node:*', 'https:*'],
    });
    const outDir = join(fnOut, name);
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, 'entry.js'), res.outputFiles[0].text);
    writeFileSync(join(outDir, 'function.jsonc'), JSON.stringify({ name, entry: 'entry.js' }, null, 2) + '\n');
    ok++;
  } catch (e) {
    failed.push([name, (e?.errors?.[0]?.text || e?.message || String(e)).slice(0, 160)]);
  }
}
console.log(`bundled ${ok} functions -> ${fnOut}`);
if (failed.length) { console.log('FAILED:'); for (const [n, m] of failed) console.log(' ', n, '—', m); process.exit(1); }
