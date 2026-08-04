// Aether Hallucination Guard — GitHub Action
// Verifies AI responses in CI/CD pipelines
// Fails the build if hallucinations are detected below the threshold

const core = require('@actions/core');
const github = require('@actions/github');
const fs = require('fs');

async function run() {
  try {
    const apiKey = core.getInput('api-key') || process.env.AETHER_API_KEY || '';
    const textInput = core.getInput('text');
    const threshold = parseInt(core.getInput('threshold') || '80');
    const failOnContested = core.getInput('fail-on-contested') === 'true';

    // Check if text is a file path
    let text = textInput;
    if (fs.existsSync(textInput)) {
      text = fs.readFileSync(textInput, 'utf8');
    }

    if (!text) {
      core.setFailed('No text provided for verification');
      return;
    }

    core.info(`🔍 Aether: Verifying ${text.length} characters...`);
    core.info(`📊 Threshold: ${threshold}/100`);

    // Call Aether verifyResponse API
    const response = await fetch(
      'https://api.base44.com/apps/6a6babb38b48187e5d4799c4/backend/functions/verifyResponse',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {})
        },
        body: JSON.stringify({ text })
      }
    );

    if (!response.ok) {
      core.setFailed(`Aether API returned ${response.status}: ${await response.text()}`);
      return;
    }

    const result = await response.json();
    const trustScore = result.trust_score || 0;
    const verdict = result.verdict || 'unknown';
    const corrections = result.corrections || [];

    // Set outputs
    core.setOutput('trust-score', trustScore);
    core.setOutput('verdict', verdict);
    core.setOutput('corrections', JSON.stringify(corrections));

    // Log results
    core.info(`\n🛡️ Aether Verification Results:`);
    core.info(`   Trust Score: ${trustScore}/100`);
    core.info(`   Verdict: ${verdict}`);

    if (corrections.length > 0) {
      core.info(`   Corrections (${corrections.length}):`);
      corrections.forEach((c, i) => {
        core.info(`   ${i + 1}. ${c}`);
      });
    }

    if (result.warrant_id) {
      core.info(`   Warrant: ${result.warrant_id}`);
      core.info(`   View: https://aether.sf2x.com/verify/${result.warrant_id}`);
    }

    // Check threshold
    if (trustScore < threshold) {
      core.setFailed(
        `❌ Aether: Trust score ${trustScore}/${threshold} — BELOW THRESHOLD. Verdict: ${verdict}. ` +
        `${corrections.length} correction(s) needed.`
      );
      return;
    }

    if (verdict === 'rejected') {
      core.setFailed(
        `❌ Aether: Verdict is REJECTED. ${corrections.length} hallucination(s) detected.`
      );
      return;
    }

    if (failOnContested && verdict === 'contested') {
      core.setFailed(
        `⚠️ Aether: Verdict is CONTESTED (fail-on-contested=true). ${corrections.length} correction(s) needed.`
      );
      return;
    }

    if (verdict === 'contested') {
      core.warning(
        `⚠️ Aether: Verdict is CONTESTED but build continues (fail-on-contested=false). ` +
        `Trust score: ${trustScore}/100. ${corrections.length} correction(s) available.`
      );
    } else {
      core.info(`✅ Aether: PASSED — Trust score ${trustScore}/100, verdict: ${verdict}`);
    }

  } catch (error) {
    core.setFailed(`Aether action failed: ${error.message}`);
  }
}

run();
