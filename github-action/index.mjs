// Aether Hallucination Guard — GitHub Action
// Verifies AI responses in CI/CD pipelines.
// Fails the build if hallucinations are detected below the threshold.
//
// ZERO DEPENDENCIES, ON PURPOSE. This Action previously required `@actions/core` and
// `@actions/github` and `action.yml` pointed at `dist/index.js` — but the repository
// contains no `dist/`, no `package.json` and no `node_modules`, so the Action could
// never load, let alone run. Rather than add a bundler and a build step, it now uses
// only Node 20 built-ins: global `fetch`, and GitHub's documented workflow commands
// (`::error::`, `$GITHUB_OUTPUT`), which are all `@actions/core` wraps. That means
// `action.yml` can point straight at this file and there is nothing to build.
//
// Two more live-probed fixes (2026-08-09):
//   · the endpoint was `api.base44.com/apps/<id>/backend/functions/verifyResponse`,
//     which returns 404 with an HTML page — that base serves nothing;
//   · auth was `Authorization: Bearer`, but the API requires `x-api-key`.
// Either one alone made every run fail.
//
// v2 (2026-08-10): advisory-by-default claim-disposition gating (MASTER_PLAN §18.2,
// §24). When the server response carries per-claim dispositions the gate uses them
// and IGNORES the raw trust score; older servers fall back to the v1 threshold rule
// unchanged. BREAKING DEFAULT: v1 blocked by default — v2 defaults to mode:
// advisory, which never fails the build; set mode: enforcing to block.

import fs from 'node:fs';
import { evaluateGateV2, hasClaimDispositions, claimGateClass, GATE_MODES } from './gate.mjs';

/** The live verifyResponse endpoint; overridable because this base has moved once. */
const DEFAULT_API_URL = 'https://aether.sf2x.com/api/functions/verifyResponse';

// ── The bits of @actions/core this Action actually used ──────────────────────

/** Inputs arrive as INPUT_<NAME>, uppercased, spaces to underscores, dashes kept. */
function getInput(name) {
  const key = `INPUT_${name.replace(/ /g, '_').toUpperCase()}`;
  return (process.env[key] || '').trim();
}

function info(message) {
  process.stdout.write(`${message}\n`);
}

/** Workflow commands are newline-delimited, so newlines must be encoded. */
function escapeData(message) {
  return String(message).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

/** Property values (file=, line=) additionally escape ':' and ','. */
function escapeProperty(value) {
  return escapeData(value).replace(/:/g, '%3A').replace(/,/g, '%2C');
}

function warning(message) {
  info(`::warning::${escapeData(message)}`);
}

/**
 * annotate — emit an error/warning annotation, optionally anchored to a file and
 * line so gating claims show up inline on the PR's Files tab. `::error::` alone
 * does not fail the step — the exit code does — so error-level annotations are
 * safe to emit before the gate decides.
 */
function annotate(level, message, props = {}) {
  const parts = Object.entries(props)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${escapeProperty(String(v))}`);
  info(`::${level}${parts.length ? ' ' + parts.join(',') : ''}::${escapeData(message)}`);
}

function setFailed(message) {
  info(`::error::${escapeData(message)}`);
  process.exitCode = 1;
}

/**
 * setOutput — append to $GITHUB_OUTPUT using the heredoc form, which is safe for
 * values containing newlines (the `corrections` JSON can). Falls back to a log line
 * when the file is absent, e.g. running locally.
 */
function setOutput(name, value) {
  const file = process.env.GITHUB_OUTPUT;
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  if (!file) {
    info(`[output] ${name}=${str}`);
    return;
  }
  const delim = `ghadelimiter_${name}_${Date.now()}`;
  fs.appendFileSync(file, `${name}<<${delim}\n${str}\n${delim}\n`, 'utf8');
}

/** Keep log lines and annotations readable — a claim can be a whole paragraph. */
function clip(text, max = 120) {
  const s = typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : '';
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

// ── The Action ──────────────────────────────────────────────────────────────

async function run() {
  try {
    const apiKey = getInput('api-key') || process.env.AETHER_API_KEY || '';
    const apiUrl = getInput('api-url') || process.env.AETHER_API_URL || DEFAULT_API_URL;
    const textInput = getInput('text');
    const thresholdRaw = getInput('threshold') || '80';
    const threshold = Number.parseInt(thresholdRaw, 10);
    const failOnContested = getInput('fail-on-contested') === 'true';
    const mode = (getInput('mode') || 'advisory').toLowerCase();

    if (!Number.isFinite(threshold)) {
      setFailed(`threshold must be a number (got "${thresholdRaw}")`);
      return;
    }

    // An unrecognized mode is a config error, not a silent default: guessing
    // "advisory" would silently disable a gate the user meant to enforce, and
    // guessing "enforcing" would block builds nobody asked to block.
    if (!GATE_MODES.includes(mode)) {
      setFailed(`mode must be "advisory" or "enforcing" (got "${getInput('mode')}")`);
      return;
    }

    // `text` may be a literal string or a path to a file containing one.
    let text = textInput;
    if (textInput && fs.existsSync(textInput)) {
      text = fs.readFileSync(textInput, 'utf8');
    }

    if (!text || !text.trim()) {
      setFailed('No text provided for verification');
      return;
    }

    // A missing key is the most common cause of a confusing 401, so say it up front.
    if (!apiKey) {
      warning(
        'No API key provided (api-key input or AETHER_API_KEY env). The Aether API ' +
          'requires one and will reject this request.',
      );
    }

    info(`🔍 Aether: Verifying ${text.length} characters...`);
    info(`📊 Threshold: ${threshold}/100 (used only when the server sends no claim dispositions)`);
    info(`🚦 Mode: ${mode}`);

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'x-api-key': apiKey } : {}),
      },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      setFailed(`Aether API returned ${response.status}: ${await response.text()}`);
      return;
    }

    const result = await response.json().catch(() => null);
    if (!result || typeof result !== 'object') {
      setFailed('Aether API returned a response that was not JSON');
      return;
    }

    const trustScore = typeof result.trust_score === 'number' ? result.trust_score : 0;
    const verdict = typeof result.verdict === 'string' ? result.verdict : 'unknown';
    const corrections = Array.isArray(result.corrections) ? result.corrections : [];
    const claims = Array.isArray(result.claims) ? result.claims : [];
    const usingDispositions = hasClaimDispositions(result);

    setOutput('trust-score', String(trustScore));
    setOutput('verdict', verdict);
    setOutput('corrections', JSON.stringify(corrections));
    setOutput('gate-decision', typeof result.gate_decision === 'string' ? result.gate_decision : '');
    setOutput('dispositions', JSON.stringify(claims.map((c) => ({
      disposition: typeof c?.disposition === 'string' ? c.disposition : null,
      materiality: typeof c?.materiality === 'string' ? c.materiality : null,
      category: c?.category ?? null,
      file_path: c?.file_path ?? null,
      diff_line: c?.diff_line ?? null,
      text: clip(c?.text, 200),
    }))));

    info('\n🛡️ Aether Verification Results:');

    if (usingDispositions) {
      // A resolver response — per-claim dispositions decide; the raw score does not.
      info(`   Claims: ${claims.length} (resolver dispositions present — raw trust score ignored)`);
      if (typeof result.resolver_version === 'string' && result.resolver_version) {
        info(`   Resolver: ${result.resolver_version}`);
      }
      if (typeof result.gate_decision === 'string' && result.gate_decision) {
        info(`   Server gate: ${result.gate_decision}`);
      }
      for (const c of claims) {
        const label = String(c.disposition).trim().toLowerCase();
        const where = c.file_path ? `${c.file_path}${c.diff_line ? `:${c.diff_line}` : ''}` : '';
        info(
          `   - ${label}${c.materiality ? ` (${c.materiality})` : ''}` +
            `${c.category ? ` · ${c.category}` : ''}${where ? ` · ${where}` : ''} — ${clip(c.text)}`,
        );
        const gateClass = claimGateClass(c);
        if (gateClass !== 'clear') {
          annotate(
            mode === 'enforcing' ? 'error' : 'warning',
            `Aether ${label}: ${clip(c.text)}`,
            { file: c.file_path, line: c.diff_line },
          );
        }
      }
    } else {
      info(`   Trust Score: ${trustScore}/100`);
      info(`   Verdict: ${verdict}`);

      if (corrections.length > 0) {
        info(`   Corrections (${corrections.length}):`);
        corrections.forEach((c, i) => info(`   ${i + 1}. ${c}`));
      }
    }

    if (result.warrant_id) {
      info(`   Warrant: ${result.warrant_id}`);
      info(`   View: https://aether.sf2x.com/verify/${result.warrant_id}`);
    }

    const gate = evaluateGateV2(result, { mode, threshold, failOnContested });

    if (gate.failed) setFailed(`❌ ${gate.message}`);
    else if (gate.level === 'warning') warning(`⚠️ ${gate.message}`);
    else info(`✅ ${gate.message}`);
  } catch (error) {
    setFailed(`Aether action failed: ${error?.message || error}`);
  }
}

run();
