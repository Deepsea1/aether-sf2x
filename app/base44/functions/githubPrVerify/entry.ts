// GitHub PR verification — the Aether wedge. Extracts claims from a PR diff,
// runs Aether Flash deterministic risk detection, evaluates each claim against
// the repo's .aether/policy.yml (or system default), sets a commit status, and
// creates Claim records + a hash-chained audit ledger entry.
//
// Accepts either:
//   - { owner, repo, pull_number, head_sha } → fetches the diff from GitHub API
//   - { owner, repo, head_sha, diff_text }  → caller provides the diff directly
//
// The GitHub connector currently has repo:status scope (commit statuses only).
// Diff fetching requires contents/pull_requests read scope; until those are
// authorized, callers pass diff_text and we set the status (which we CAN do).

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { extractClaimsFromDiff, extractClaims } from '../../shared/claimExtractor.js';
import { flashScanBatch } from '../../shared/aetherFlash.js';
import { parsePolicyYaml, evaluatePolicy, computePolicyHash } from '../../shared/policyParser.js';
import { buildLedgerEntry } from '../../shared/ledger.js';
import { emitTelemetry, newTraceId } from '../../shared/telemetry.js';

const SYSTEM_DEFAULT_POLICY = parsePolicyYaml(`
version: 1
default_action: warn
rules:
  - category: benchmark_claim
    action: require_verification
  - category: security_claim
    action: require_human_review
    min_evidence_tier: primary_authoritative
  - category: financial_claim
    action: block_if_stale
    freshness_days: 7
  - category: medical_claim
    action: require_human_review
  - category: legal_claim
    action: require_human_review
release_gate:
  block_on:
    - contradicted
    - unsupported
  require_review_on:
    - mixed
    - supported_with_limits
`);

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
    const body = await req.json().catch(() => ({}));
    const { owner, repo, pull_number, head_sha, diff_text, policy_yaml, domain = 'general' } = body;

    if (!owner || !repo || !head_sha) {
      return Response.json({ error: 'owner, repo, and head_sha are required' }, { status: 400 });
    }

    const invalidPathField = validateGithubPathParams({ owner, repo, head_sha, pull_number });
    if (invalidPathField) {
      return Response.json({ error: `${invalidPathField} is invalid` }, { status: 400 });
    }

    const traceId = newTraceId();
    const svc = base44.asServiceRole;
    const tenant_id = user.id;

    // Get the GitHub connector token.
    let accessToken = null;
    try {
      const conn = await svc.connectors.getConnection('github');
      accessToken = conn.accessToken;
    } catch { /* connector not connected — caller must provide diff_text */ }

    // ---- Fetch the PR diff (if pull_number provided and we have a token) ----
    let diff = diff_text || '';
    let prData = null;
    if (!diff && pull_number && accessToken) {
      try {
        const prRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${pull_number}`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/vnd.github.v3.diff',
            'User-Agent': 'Aether-Truth-Layer',
          },
        });
        if (prRes.ok) {
          diff = await prRes.text();
          // Also fetch PR metadata for the title/body.
          try {
            const metaRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${pull_number}`, {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: 'application/vnd.github+json',
                'User-Agent': 'Aether-Truth-Layer',
              },
            });
            if (metaRes.ok) prData = await metaRes.json();
          } catch { /* metadata is optional */ }
        }
      } catch (e) {
        console.error('PR diff fetch failed:', e?.message || e);
      }
    }

    if (!diff) {
      return Response.json({
        error: 'No diff available. Provide diff_text in the request body, or authorize the GitHub connector with pull_requests:read scope to auto-fetch.',
      }, { status: 400 });
    }

    // ---- Load the repo policy (from .aether/policy.yml or the request body) ----
    let policy = SYSTEM_DEFAULT_POLICY;
    let policySource = 'system_default';
    if (policy_yaml) {
      policy = parsePolicyYaml(policy_yaml, { source_repo: `${owner}/${repo}` });
      policySource = 'request_body';
    } else if (accessToken) {
      // Try to fetch .aether/policy.yml from the repo.
      try {
        const polRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/.aether/policy.yml`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/vnd.github+json',
            'User-Agent': 'Aether-Truth-Layer',
          },
        });
        if (polRes.ok) {
          const polJson = await polRes.json();
          if (polJson.content) {
            const yamlText = atob(polJson.content.replace(/\n/g, ''));
            policy = parsePolicyYaml(yamlText, { source_repo: `${owner}/${repo}` });
            policySource = 'repository';
          }
        }
      } catch (e) {
        console.error('Policy fetch failed, using system default:', e?.message || e);
      }
    }
    policy.policy_hash = await computePolicyHash(policy);
    policy.status = 'active';

    // Persist the policy (if it's new or changed).
    let policyRecord = null;
    try {
      const existing = await svc.entities.Policy.filter({ policy_hash: policy.policy_hash }, '-created_date', 1);
      if (existing && existing.length) {
        policyRecord = existing[0];
      } else {
        policyRecord = await svc.entities.Policy.create(policy);
      }
    } catch (e) {
      console.error('Policy persist failed:', e?.message || e);
    }

    // ---- Extract claims from the diff ----
    const claims = extractClaimsFromDiff(diff, {
      owner, repo, pull_number, head_sha, domain, tenant_id,
    });

    // Also extract from the PR title/body if available.
    if (prData && prData.title) {
      const titleClaims = extractClaims(prData.title + ' ' + (prData.body || ''), {
        source_asset_type: 'pr_diff', source_asset_id: `pr:${owner}/${repo}#${pull_number}@${head_sha}`,
        domain, tenant_id,
      });
      claims.push(...titleClaims);
    }

    if (!claims.length) {
      // No factual claims found — set a clean status.
      const statusState = 'success';
      await setCommitStatus(accessToken, owner, repo, head_sha, statusState, 'No in-scope claims detected', pull_number);
      await createLedgerEntry(svc, {
        event_type: 'gate_passed', entity_type: 'PullRequest',
        entity_id: `${owner}/${repo}#${pull_number || 'n/a'}@${head_sha}`,
        actor_id: user.id, tenant_id, trace_id: traceId,
        summary: `PR scan: no in-scope claims detected · ${owner}/${repo}`,
        metadata: { owner, repo, pull_number, head_sha, claims_count: 0, policy_source: policySource },
      });
      return Response.json({
        owner, repo, pull_number, head_sha,
        claims: [],
        flash_summary: { total: 0, clear: 0, needs_support: 0, full_verification_required: 0 },
        policy: { source: policySource, policy_id: policy.policy_id, default_action: policy.default_action },
        gate_decision: 'passed',
        commit_status: statusState,
      });
    }

    // ---- Run Aether Flash on all claims ----
    const flashResults = flashScanBatch(claims.map((c) => ({ text: c.text, sources: [] })), { domain });

    // ---- Evaluate each claim against the policy ----
    const evaluatedClaims = claims.map((claim, i) => {
      const flash = flashResults.results[i].result;
      const policyResult = evaluatePolicy(policy, {
        category: claim.category,
        verdict_status: claim.verdict_status,
      });
      return {
        ...claim,
        flash_signals: flash.signals,
        flash_state: flash.state,
        policy_decision: policyResult.action,
        policy_rule: policyResult.rule ? policyResult.rule.category : null,
        policy_reason: policyResult.reason || null,
      };
    });

    // ---- Persist Claim records ----
    const persistedClaims = [];
    for (const claim of evaluatedClaims) {
      try {
        const rec = await svc.entities.Claim.create({
          text: claim.text,
          category: claim.category,
          subject: claim.subject,
          predicate: claim.predicate,
          object: claim.object,
          risk_level: claim.risk_level,
          extraction_confidence: claim.extraction_confidence,
          source_asset_type: claim.source_asset_type,
          source_asset_id: claim.source_asset_id,
          source_excerpt: claim.source_excerpt,
          flash_signals: claim.flash_signals,
          verdict_status: claim.verdict_status,
          coverage_state: 'unverified',
          policy_decision: claim.policy_decision,
          tenant_id,
          description: `Extracted from PR ${owner}/${repo}#${pull_number || 'n/a'} · ${claim.flash_state}`,
        });
        persistedClaims.push({ ...claim, id: rec.id });
      } catch (e) {
        console.error('Claim persist failed:', e?.message || e);
        persistedClaims.push(claim);
      }
    }

    // ---- Determine gate decision ----
    const blockCount = evaluatedClaims.filter((c) => c.policy_decision === 'block').length;
    const reviewCount = evaluatedClaims.filter((c) => c.policy_decision === 'require_review' || c.policy_decision === 'require_human_review').length;
    const warnCount = evaluatedClaims.filter((c) => c.policy_decision === 'warn' || c.policy_decision === 'require_verification').length;

    let gateDecision, statusState, statusDesc;
    if (blockCount > 0) {
      gateDecision = 'blocked';
      statusState = 'failure';
      statusDesc = `${blockCount} claim(s) blocked by policy`;
    } else if (reviewCount > 0) {
      gateDecision = 'requires_review';
      statusState = 'failure';
      statusDesc = `${reviewCount} claim(s) require human review`;
    } else if (warnCount > 0) {
      gateDecision = 'warned';
      statusState = 'success';
      statusDesc = `${warnCount} claim(s) need verification (warnings only)`;
    } else {
      gateDecision = 'passed';
      statusState = 'success';
      statusDesc = `${evaluatedClaims.length} claim(s) scanned, no policy violations`;
    }

    // ---- Set commit status ----
    await setCommitStatus(accessToken, owner, repo, head_sha, statusState, statusDesc, pull_number);

    // ---- Post PR review with inline annotations (best-effort) ----
    const reviewResult = await postPrReview(accessToken, owner, repo, pull_number, evaluatedClaims, gateDecision, statusDesc);

    // ---- Create hash-chained audit ledger entry ----
    await createLedgerEntry(svc, {
      event_type: gateDecision === 'blocked' ? 'gate_failed' : 'gate_passed',
      entity_type: 'PullRequest',
      entity_id: `${owner}/${repo}#${pull_number || 'n/a'}@${head_sha}`,
      actor_id: user.id,
      tenant_id,
      trace_id: traceId,
      summary: `PR gate ${gateDecision} · ${evaluatedClaims.length} claims · ${blockCount} blocked · ${reviewCount} review · ${warnCount} warn · ${owner}/${repo}`,
      metadata: {
        owner, repo, pull_number, head_sha,
        claims_count: evaluatedClaims.length,
        block_count: blockCount,
        review_count: reviewCount,
        warn_count: warnCount,
        policy_source: policySource,
        policy_id: policy.policy_id,
        policy_hash: policy.policy_hash,
        flash_summary: flashResults.summary,
        gate_decision: gateDecision,
      },
    });

    // ---- Emit telemetry ----
    await emitTelemetry(svc, {
      trace_id: traceId,
      event_type: 'gate_checked',
      span_type: 'gate_check',
      group: 'governance',
      linked_entity_type: 'PullRequest',
      linked_entity_id: `${owner}/${repo}#${pull_number || 'n/a'}@${head_sha}`,
      governance: {
        policy_rule_id: policy.policy_id,
        policy_version: policy.version,
        policy_decision: gateDecision,
        gate_result: gateDecision,
      },
      summary: `GitHub PR gate · ${gateDecision} · ${evaluatedClaims.length} claims`,
    }).catch(() => {});

    return Response.json({
      owner, repo, pull_number, head_sha,
      claims: persistedClaims.map((c) => ({
        id: c.id,
        text: c.text,
        category: c.category,
        risk_level: c.risk_level,
        flash_state: c.flash_state,
        flash_signals: c.flash_signals,
        policy_decision: c.policy_decision,
        policy_rule: c.policy_rule,
        file_path: c.file_path,
        diff_line: c.diff_line,
      })),
      flash_summary: flashResults.summary,
      policy: {
        source: policySource,
        policy_id: policy.policy_id,
        policy_hash: policy.policy_hash,
        default_action: policy.default_action,
        rules_count: policy.rules.length,
      },
      gate_decision: gateDecision,
      commit_status: statusState,
      commit_description: statusDesc,
      pr_review: reviewResult ? { posted: true, review_id: reviewResult.id, review_url: reviewResult.html_url, annotations: reviewResult.annotation_count } : { posted: false },
      claim_counts: {
        total: evaluatedClaims.length,
        blocked: blockCount,
        require_review: reviewCount,
        warned: warnCount,
        clear: evaluatedClaims.length - blockCount - reviewCount - warnCount,
      },
      verify_url: `https://aether.ai/verify/${head_sha}`,
    });
  } catch (error) {
    console.error('githubPrVerify error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// ---- Helpers ----

// owner/repo/head_sha/pull_number are interpolated into api.github.com URLs
// with the connector token attached — validate them strictly so a crafted
// value cannot retarget the request at a different API endpoint. Returns the
// first invalid field name, or null when all parts are valid. pull_number is
// optional but must coerce to a positive integer when supplied.
const GITHUB_NAME_RE = /^[A-Za-z0-9_.-]+$/;
const GITHUB_SHA_RE = /^[0-9a-fA-F]{7,40}$/;

function validateGithubPathParams({ owner, repo, head_sha, pull_number }) {
  if (!GITHUB_NAME_RE.test(owner) || owner === '.' || owner === '..') return 'owner';
  if (!GITHUB_NAME_RE.test(repo) || repo === '.' || repo === '..') return 'repo';
  if (!GITHUB_SHA_RE.test(head_sha)) return 'head_sha';
  if (pull_number != null) {
    const n = Number(pull_number);
    if (!Number.isInteger(n) || n <= 0) return 'pull_number';
  }
  return null;
}

// Post a PR review with inline line-level annotations for blocked/review claims.
// Requires pulls:write scope — gracefully degrades to a no-op when the connector
// only has repo:status (returns null, doesn't throw).
async function postPrReview(accessToken, owner, repo, pullNumber, claims, gateDecision, statusDesc) {
  if (!accessToken || !pullNumber) return null;

  const annotatable = claims.filter(
    (c) => c.file_path && c.diff_line && ['block', 'require_review', 'require_human_review', 'require_verification'].includes(c.policy_decision),
  );

  const comments = annotatable.map((c) => ({
    path: c.file_path,
    line: c.diff_line,
    side: 'RIGHT',
    body: `**Aether · ${c.policy_decision.replace(/_/g, ' ')}** · ${c.category.replace(/_/g, ' ')}\n\n> ${c.text}\n\nFlash: ${c.flash_state?.replace(/_/g, ' ') || 'unknown'}${c.flash_signals?.length ? '\n' + c.flash_signals.map((s) => `- **${s.severity}**: ${s.detail}`).join('\n') : ''}`,
  }));

  const event = gateDecision === 'blocked' ? 'request_changes' : (gateDecision === 'requires_review' ? 'pending' : 'comment');
  const reviewBody = `## Aether Truth Layer — PR Verification\n\n**Gate: ${gateDecision.toUpperCase()}** · ${statusDesc}\n\n${claims.length} claim(s) scanned · ${comments.length} inline annotation(s)${annotatable.length < claims.length ? ` · ${claims.length - annotatable.length} without file position` : ''}`;

  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/reviews`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        'User-Agent': 'Aether-Truth-Layer',
      },
      body: JSON.stringify({ body: reviewBody, event, comments }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error('PR review post failed:', res.status, text.slice(0, 200));
      return null;
    }
    const data = await res.json();
    return { ...data, annotation_count: comments.length };
  } catch (e) {
    console.error('PR review post error:', e?.message || e);
    return null;
  }
}

async function setCommitStatus(accessToken, owner, repo, sha, state, description, pull_number) {
  if (!accessToken) return; // can't set status without the connector
  const statusBody = {
    state,
    description: description.slice(0, 140),
    context: 'Aether Truth Layer',
  };
  if (pull_number) {
    statusBody.target_url = `https://aether.ai/verify/${sha}`;
  }
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/statuses/${sha}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        'User-Agent': 'Aether-Truth-Layer',
      },
      body: JSON.stringify(statusBody),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error('GitHub status set failed:', res.status, text.slice(0, 200));
    }
  } catch (e) {
    console.error('GitHub status set error:', e?.message || e);
  }
}

async function createLedgerEntry(svc, params) {
  try {
    const entry = await buildLedgerEntry(svc, params);
    await svc.entities.AuditLog.create(entry);
  } catch (e) {
    console.error('Ledger entry failed:', e?.message || e);
  }
}