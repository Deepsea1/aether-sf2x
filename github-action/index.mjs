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

import fs from 'node:fs';
import { evaluateGate } from './gate.mjs';

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

function warning(message) {
  info(`::warning::${escapeData(message)}`);
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

// ── The Action ──────────────────────────────────────────────────────────────

async function run() {
  try {
    const apiKey = getInput('api-key') || process.env.AETHER_API_KEY || '';
    const apiUrl = getInput('api-url') || process.env.AETHER_API_URL || DEFAULT_API_URL;
    const textInput = getInput('text');
    const thresholdRaw = getInput('threshold') || '80';
    const threshold = Number.parseInt(thresholdRaw, 10);
    const failOnContested = getInput('fail-on-contested') === 'true';

    if (!Number.isFinite(threshold)) {
      setFailed(`threshold must be a number (got "${thresholdRaw}")`);
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
    info(`📊 Threshold: ${threshold}/100`);

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

    setOutput('trust-score', String(trustScore));
    setOutput('verdict', verdict);
    setOutput('corrections', JSON.stringify(corrections));

    info('\n🛡️ Aether Verification Results:');
    info(`   Trust Score: ${trustScore}/100`);
    info(`   Verdict: ${verdict}`);

    if (corrections.length > 0) {
      info(`   Corrections (${corrections.length}):`);
      corrections.forEach((c, i) => info(`   ${i + 1}. ${c}`));
    }

    if (result.warrant_id) {
      info(`   Warrant: ${result.warrant_id}`);
      info(`   View: https://aether.sf2x.com/verify/${result.warrant_id}`);
    }

    const gate = evaluateGate({
      trustScore,
      verdict,
      threshold,
      failOnContested,
      correctionCount: corrections.length,
    });

    if (gate.failed) setFailed(`❌ ${gate.message}`);
    else if (gate.level === 'warning') warning(`⚠️ ${gate.message}`);
    else info(`✅ ${gate.message}`);
  } catch (error) {
    setFailed(`Aether action failed: ${error?.message || error}`);
  }
}

run();
