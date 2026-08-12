// GitHub PR verification — the Aether wedge. Extracts claims from a PR diff,
// runs Aether Flash deterministic risk detection, evaluates each claim against
// the repo's .aether/policy.yml (or system default), sets a commit status, and
// creates Claim records + a hash-chained audit ledger entry. On a re-push of
// the same PR, unchanged claims reuse their stored verdicts via the
// VerdictReuse cache (MASTER_PLAN v5 §7.2 delta rule) instead of re-evaluating.
//
// P3 (Mission A): the wedge now grounds evidence and resolves deterministic
// dispositions. Claims that cite http(s) URLs get each citation fetched through
// attest.js's SSRF-guarded machinery (content hash, excerpt, quote_present,
// applicability v1 — §5.4), every claim gets a disposition from the §8.1
// resolver ladder, the gate honors policy.mode (advisory never blocks — §11.3),
// and needs-review dispositions hand off to the Review pipeline (§12.5).
// Evidence is input to the resolver, never a gate on the function — fetch
// failures degrade a claim's disposition, they never crash the run.
//
// P4 (defensible wedge): three run-level honesty layers. Independence (§5.6):
// a claim's citations are clustered by origin so corroboration reads per
// independent origin, never per citation. The §18.2 symmetric enforcing gate:
// an enforcing policy only hard-blocks when the domain pack's active
// capability card carries measured false-block rates under threshold —
// otherwise the run degrades to advisory and says why; advisory and v1
// policies bypass the check entirely. Mode awareness (§15.4): the active
// service mode is stamped on every response, and a degraded-evaluation mode
// forces advisory — a breaker never lets the gate block on evaluation it
// cannot trust. Every forced degradation lands in gate_reasons.
//
// Accepts either:
//   - { owner, repo, pull_number, head_sha } → fetches the diff from GitHub API
//   - { owner, repo, head_sha, diff_text }  → caller provides the diff directly
//
// The GitHub connector currently has repo:status scope (commit statuses only).
// Diff fetching requires contents/pull_requests read scope; until those are
// authorized, callers pass diff_text and we set the status (which we CAN do).

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveGithubCapability, evidenceFetchBudget } from '../../shared/githubCapability.js';
import { extractClaimsFromDiff, extractClaims } from '../../shared/claimExtractor.js';
import { flashScanBatch } from '../../shared/aetherFlash.js';
import { parsePolicyYaml, evaluatePolicy, computePolicyHash } from '../../shared/policyParser.js';
import { buildLedgerEntry } from '../../shared/ledger.js';
import { emitTelemetry, newTraceId } from '../../shared/telemetry.js';
import { PIPELINE_VERSION, claimReuseKey, lookupVerdicts, storeVerdict, recordHit } from '../../shared/verdictReuse.js';
import { jcsCanonicalize, sha256Hex } from '../../shared/canonicalSign.js';
import { assertSafeSourceUrl, safeFetchValidated, tierForSource } from '../../shared/attest.js';
import { assessApplicability, quotePresent, buildResolverInputs } from '../../shared/applicability.js';
import { RESOLVER_VERSION, resolveClaim, resolveGate } from '../../shared/decisionResolver.js';
import { persistClaimEvidence } from '../../shared/claimPersistence.js';
import { createReviewsForGate } from '../../shared/reviews.js';
import { clusterSources } from '../../shared/independence.js';
import { getActiveCard, enforcingAllowed } from '../../shared/capabilityCard.js';
import { getActiveMode, DEGRADED_FORCES_ADVISORY } from '../../shared/serviceMode.js';

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

// No LLM participates in this wedge's per-claim evaluation today — extraction
// (claimExtractor), the risk scan (aetherFlash), and evaluatePolicy are all
// deterministic — so the reuse key's model component is this stable constant.
// If an LLM tier (tribunal escalation) ever lands in this path, swap in the
// effective model id so cached deterministic verdicts can never satisfy it.
const EVAL_MODEL = 'deterministic';

// CAPABILITY-SPLIT AUTH — the boundary is what a request TOUCHES, not who is
// asking. Exactly three things here reach Aether's own GitHub connector token:
// fetching the PR diff, fetching the repo's .aether/policy.yml, and writing
// back (commit status + PR review). The demo this endpoint's page exists for —
// paste a diff, watch Aether find the unsupported claims — touches none of them.
//
// So a non-admin caller never acquires the token at all. It is not that the
// GitHub calls are permission-checked at each call site; there is no credential
// in scope to make them with, and every GitHub helper below already no-ops on a
// null token. Structural unreachability beats a role check you can forget to
// repeat, and it is what lets /github-pr-verify stay in the public nav.
//
// Admin (which per shared/auth.js also covers the platform workflow principal)
// gets the full path: token acquired, diff and policy fetched, status and
// review written.
//
// Why the token is not simply scoped to the caller's own repos: Base44
// connectors are a single platform-wide connection, so there is no per-customer
// GitHub credential, and no repo-entitlement record exists in the entity set.
// Before this split, a bare "is there a user" check made this a confused deputy
// — any signed-up account could spend Aether's GitHub identity against any repo
// that token could reach, reading private PR diffs (returned as extracted claim
// text) and posting reviews up to request_changes under Aether's name.
// Customers who want the gate on their own repository run the Action, which
// uses their repo-scoped GITHUB_TOKEN and never needs ours.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    let user = null;
    try { user = await base44.auth.me(); } catch { /* fall through to the 401 */ }
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

    // Demo tier: no token in scope, so the request must carry its own diff and
    // cannot ask for a PR fetch. The refusals say WHY and name the path that
    // does work on the caller's own repo. Decision lives in shared/ so it is
    // unit-tested (shared/tests/githubCapability.test.mjs).
    const capability = resolveGithubCapability({
      role: user.role,
      pullNumber: pull_number,
      diffText: diff_text,
    });
    if (!capability.ok) {
      return Response.json({ error: capability.error }, { status: capability.status });
    }
    const isAdmin = capability.isAdmin;

    const traceId = newTraceId();
    const svc = base44.asServiceRole;
    const tenant_id = user.id;

    // Get the GitHub connector token — admin callers only. A demo run leaves
    // this null, which is what makes every GitHub read and write below a no-op
    // rather than a permission check (see the header).
    let accessToken = null;
    if (isAdmin) {
      try {
        const conn = await svc.connectors.getConnection('github');
        accessToken = conn.accessToken;
      } catch { /* connector not connected — caller must provide diff_text */ }
    }

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

    // Persist the policy (if it's new or changed) — admin runs only. policy_yaml
    // is caller-supplied and each distinct YAML hashes to a new row, so
    // persisting demo runs would let any signup mint Policy rows at will.
    // policyRecord is not read downstream; the run uses `policy` itself.
    let policyRecord = null;
    if (isAdmin) {
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

    // ---- §11.3 cost cap: max_claims_per_run — over-cap degrades the run to
    // advisory and says exactly what was skipped. Never silent truncation.
    const totalClaimsFound = claims.length;
    const runNotes = [];
    const maxClaimsPerRun = Number(policy.max_claims_per_run);
    let runForcedAdvisory = false;
    if (Number.isFinite(maxClaimsPerRun) && maxClaimsPerRun > 0 && claims.length > maxClaimsPerRun) {
      claims.splice(maxClaimsPerRun);
      runForcedAdvisory = true;
      runNotes.push(`max_claims_per_run: ${totalClaimsFound} claims found, first ${maxClaimsPerRun} evaluated (${totalClaimsFound - maxClaimsPerRun} skipped) — gate degraded to advisory for this run`);
    }
    // Policy mode (§11.3 / policy v2 contract): the v2 parser sets mode itself
    // ('advisory' when a v2 file omits it); absent mode — a v1 policy — keeps
    // the file's current enforcing behavior. Over-cap forces advisory, and the
    // §15.4 / §18.2 checks below can force it further — forcing only ever
    // moves toward not-blocking, never the reverse.
    let advisoryMode = policy.mode === 'advisory' || runForcedAdvisory;
    const gateNotes = [];

    // ---- Service-mode awareness (§15.4) — read once per run, never fatal.
    // getActiveMode itself degrades to { mode: 'normal', mode_read_error: true }
    // on a read failure; the try/catch only guards an unexpected module throw.
    // The stamp rides the response so degradation is surfaced, never hidden,
    // and a degraded-evaluation mode forces advisory — a breaker never lets
    // the gate block on evaluation it cannot trust.
    let serviceMode = { mode: 'normal' };
    try { serviceMode = await getActiveMode(svc); } catch (e) { serviceMode = { mode: 'normal', mode_read_error: true }; }
    const modeStamp = serviceMode.mode_read_error ? { service_mode: serviceMode.mode, mode_read_error: true } : { service_mode: serviceMode.mode };
    if (DEGRADED_FORCES_ADVISORY.includes(serviceMode.mode)) {
      advisoryMode = true;
      gateNotes.push(`service mode '${serviceMode.mode}' forces advisory for this run (§15.4 — a breaker never lets the gate block on degraded evaluation)`);
    }

    // ---- §18.2 symmetric enforcing gate: an enforcing policy may only
    // hard-block when the domain pack's ACTIVE capability card carries
    // measured (not null) false-block rates under threshold. Advisory and v1
    // policies bypass this check entirely — their behavior is unchanged. A
    // card lookup failure fails toward advisory, never toward blocking.
    if (policy.mode === 'enforcing') {
      let cardGate;
      try {
        const card = await getActiveCard(svc, policy.domain_pack || 'technical-docs@1.0');
        cardGate = enforcingAllowed(card);
      } catch (e) {
        console.error('Capability card lookup failed:', e?.message || e);
        cardGate = { allowed: false, reasons: [`capability card lookup failed: ${String(e?.message || e).slice(0, 160)}`] };
      }
      if (!cardGate.allowed) {
        advisoryMode = true;
        gateNotes.push(`enforcing requested but not unlocked: ${cardGate.reasons.join('; ')} (§18.2 symmetric gate — no default hard-blocking without a measured false-block rate)`);
      }
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
        claims_evaluated: 0,
        claims_reused: 0,
        resolver_version: RESOLVER_VERSION,
        advisory_mode: advisoryMode,
        github_operations_enabled: isAdmin,
        gate_reasons: gateNotes,
        ...modeStamp,
      });
    }

    // ---- Run Aether Flash on all claims ----
    // Deterministic tier-0 pre-pass — always re-runs, never cached: it is free,
    // date-dependent (stale-source years), and domain-dependent (domain is not
    // part of the reuse key), so flash fields always come out fresh.
    const flashResults = flashScanBatch(claims.map((c) => ({ text: c.text, sources: [] })), { domain });

    // === CLAIM-LEVEL VERDICT REUSE — the §7.2 delta rule for the CI wedge ===
    // On a re-push of the same PR, unchanged claims reuse their stored policy
    // verdict; only new/changed claims (or a changed policy) evaluate fresh.
    // The key binds normalized claim text + the policy inputs that actually
    // decide a verdict + model + pipeline version, so a hit is only ever an
    // exact re-run. policy.policy_hash is NOT used directly: computePolicyHash
    // folds in policy_id, which parsePolicyYaml defaults to a Date.now()-based
    // value — a timestamp that would silently poison every key. evaluatePolicy
    // reads default_action / rules / release_gate (+ materiality_rules once the
    // v2 parser lands, and mode decides the gate posture), so those are all
    // folded in; version is folded in anyway so a semantic policy bump
    // over-invalidates (the safe direction).
    // Any cache failure degrades to full evaluation — the cache is an
    // accelerator, never a gate.
    let reuseKeys = [];
    let verdictHits = new Map();
    try {
      const reusePolicyHash = await sha256Hex(jcsCanonicalize({
        default_action: policy.default_action,
        materiality_rules: policy.materiality_rules ?? null,
        mode: policy.mode ?? null,
        release_gate: policy.release_gate,
        rules: policy.rules,
        version: policy.version,
      }));
      reuseKeys = await Promise.all(claims.map((c) => claimReuseKey({
        claim_text: c.text,
        policy_hash: reusePolicyHash,
        model: EVAL_MODEL,
        pipeline_version: PIPELINE_VERSION,
      })));
      verdictHits = await lookupVerdicts(svc, reuseKeys);
    } catch (e) {
      console.error('Verdict reuse lookup failed, evaluating all claims:', e?.message || e);
      reuseKeys = [];
      verdictHits = new Map();
    }

    // ---- Evaluate each claim against the policy (cached verdicts skip this) ----
    const evaluatedClaims = claims.map((claim, i) => {
      const flash = flashResults.results[i].result;
      const cached = reuseKeys.length === claims.length ? verdictHits.get(reuseKeys[i]) : null;
      // Fail closed on the payload: a cached record without a usable
      // policy_decision is a miss, never a blank verdict.
      if (cached && cached.payload && typeof cached.payload.policy_decision === 'string' && cached.payload.policy_decision) {
        return {
          ...claim,
          flash_signals: flash.signals,
          flash_state: flash.state,
          policy_decision: cached.payload.policy_decision,
          policy_rule: cached.payload.policy_rule || null,
          policy_reason: cached.payload.policy_reason || null,
          materiality: typeof cached.payload.materiality === 'string' ? cached.payload.materiality : materialityFromRisk(claim.risk_level),
          reused: true,
        };
      }
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
        // Materiality (§6.2): the v2 parser's evaluatePolicy applies floor
        // rules and returns materiality; until then (v1 policies) it derives
        // from the claim's deterministic risk level.
        materiality: typeof policyResult.materiality === 'string' ? policyResult.materiality : materialityFromRisk(claim.risk_level),
        reused: false,
      };
    });

    // Record hits and store fresh verdicts for the next push. Both are
    // best-effort (storeVerdict/recordHit never throw) — a cold cache costs
    // nothing, the verdicts above are already computed. Duplicate claim texts
    // in one run share a key; store each key once.
    const claimsReused = evaluatedClaims.filter((c) => c.reused).length;
    const claimsEvaluated = evaluatedClaims.length - claimsReused;
    if (reuseKeys.length === evaluatedClaims.length) {
      const storedKeys = new Set();
      for (let i = 0; i < evaluatedClaims.length; i++) {
        const c = evaluatedClaims[i];
        if (c.reused) {
          await recordHit(svc, verdictHits.get(reuseKeys[i]));
        } else if (!storedKeys.has(reuseKeys[i])) {
          storedKeys.add(reuseKeys[i]);
          await storeVerdict(svc, {
            reuse_key: reuseKeys[i],
            kind: 'claim',
            payload: {
              category: c.category,
              risk_level: c.risk_level,
              verdict_status: c.verdict_status,
              policy_decision: c.policy_decision,
              policy_rule: c.policy_rule,
              policy_reason: c.policy_reason,
              materiality: c.materiality,
            },
            pipeline_version: PIPELINE_VERSION,
            model: EVAL_MODEL,
            ttl_days: 7,
          });
        }
      }
    }

    // ---- Evidence grounding (§5.4): fetch cited URLs, hash + quote-check ----
    // For claims whose text cites http(s) URLs, fetch each citation through
    // the SAME SSRF-guarded machinery the warrant pipeline uses, and record
    // per citation: content hash, excerpt, fetch outcome, quote_present (8+
    // word normalized containment — deterministic, no LLM), and the
    // deterministic applicability v1 assessment. Fetches are capped per run
    // with an explicit note — no silent truncation — and failures never crash
    // the run: evidence is input to the resolver, not a gate on the function.
    // Demo runs fetch nothing outbound. Grounding is the one part of this
    // pipeline that makes network calls on caller-supplied input, so leaving it
    // on for unmetered signups would be the abuse vector this split otherwise
    // closes — there is no quota module in shared/ to meter it with. A demo run
    // is therefore pure local computation, and says so in notes below.
    const maxEvidenceFetches = evidenceFetchBudget(isAdmin, policy.max_evidence_fetches);
    const snapshotCache = new Map();
    let fetchBudget = maxEvidenceFetches;
    let fetchesCapped = false;
    for (const claim of evaluatedClaims) {
      const urls = citedUrls(claim.text);
      if (!urls.length) continue;
      const citations = [];
      for (const url of urls) {
        if (!snapshotCache.has(url)) {
          if (fetchBudget <= 0) { fetchesCapped = true; break; }
          fetchBudget--;
          snapshotCache.set(url, await snapshotCitation(url));
        }
        const snap = snapshotCache.get(url);
        citations.push({
          url,
          tier: tierForSource(url).tier,
          locator: { type: 'url', value: url },
          fetched_at: snap.fetched_at,
          fetched_ok: snap.fetched_ok,
          status: snap.status,
          content_hash: snap.content_hash,
          content_length: snap.content_length,
          excerpt: snap.excerpt,
          http_date: snap.http_date,
          quote_present: snap.fetched_ok ? quotePresent(claim.text, snap.content) : false,
          applicability: assessApplicability({
            claimText: claim.text,
            snapshot: { url, fetchedOk: snap.fetched_ok, contentExcerpt: snap.content, contentHash: snap.content_hash, httpDate: snap.http_date },
          }),
        });
      }
      if (citations.length) {
        claim.evidence = citations;
        // §5.6 independence: corroboration counts per independent origin, not
        // per citation — four syndicated copies of one story are one voice.
        // Pure math over the snapshots already gathered; wrapped so
        // independence can never fail the run.
        try {
          const indep = clusterSources(citations.map((c) => ({ url: c.url, content_hash: c.content_hash, excerpt: c.excerpt })));
          claim.independent_origins = indep.independent_origins;
          claim.independence_flags = indep.flags;
        } catch (e) {
          console.error('Independence clustering failed:', e?.message || e);
        }
      }
    }
    if (!isAdmin) {
      runNotes.push('demo run: citation evidence was not fetched — outbound grounding is an admin capability, so cited URLs are unverified here and every claim is scored on extraction and policy alone');
    } else if (fetchesCapped) {
      runNotes.push(`evidence_fetches_capped: citation fetches limited to ${maxEvidenceFetches} per run — remaining cited URLs were not fetched`);
    }

    // ---- §8.1 resolver: deterministic disposition per claim -----------------
    // Inputs come from what the wedge actually knows: policy prohibition,
    // Flash injection indicators, pack scope, the verdict pipeline's
    // contradicted/unsupported statuses, and the evidence grounded above.
    // verified_for_stated_use is unreachable in v1 — the wedge never fully
    // verifies, so quote-backed claims cap at supported_with_limits and
    // unverified claims are honestly 'unknown'.
    for (const claim of evaluatedClaims) {
      claim.disposition = resolveClaim(buildResolverInputs({
        policyDecision: claim.policy_decision,
        flashSignals: claim.flash_signals,
        verdictStatus: claim.verdict_status,
        outOfScope: isOutOfScopePath(policy, claim.file_path),
        materiality: claim.materiality,
        citations: claim.evidence || [],
      }));
    }
    const dispositionCounts = evaluatedClaims.reduce((acc, c) => {
      acc[c.disposition] = (acc[c.disposition] || 0) + 1;
      return acc;
    }, {});

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
          description: `Extracted from PR ${owner}/${repo}#${pull_number || 'n/a'} · ${claim.flash_state} · ${claim.disposition}`,
        });
        persistedClaims.push({ ...claim, id: rec.id });
        // Persist the citation evidence (locator + applicability + quote) as an
        // EvidencePack. persistClaimEvidence never throws by design; the catch
        // is belt-and-suspenders so evidence bookkeeping can never fail the run.
        if (claim.evidence && claim.evidence.length) {
          await persistClaimEvidence(svc, {
            claimId: rec.id,
            tenantId: tenant_id,
            claimText: claim.text,
            citations: claim.evidence,
          }).catch((e) => console.error('Evidence persist failed:', e?.message || e));
        }
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

    // ---- §8 resolver gate overlay + §11.3 advisory mode ---------------------
    // resolveGate can only tighten the legacy decision (the resolver found a
    // material disposition the policy counts missed); advisory mode then
    // downgrades any block to requires_review and keeps the commit status
    // green — in advisory mode findings are reported, never enforced. v1
    // policies have no mode, so their enforcing behavior is unchanged.
    const resolverGate = resolveGate(
      evaluatedClaims.map((c, i) => ({ id: String(i + 1), disposition: c.disposition, materiality: c.materiality })),
      advisoryMode ? { ...policy, mode: 'advisory' } : policy,
    );
    if (resolverGate.gate_decision === 'blocked' && gateDecision !== 'blocked') {
      gateDecision = 'blocked';
      statusState = 'failure';
      statusDesc = resolverGate.reasons[0] || 'resolver: blocking claim disposition';
    } else if (resolverGate.gate_decision === 'requires_review' && (gateDecision === 'passed' || gateDecision === 'warned')) {
      gateDecision = 'requires_review';
      statusState = 'failure';
      statusDesc = resolverGate.reasons[0] || 'resolver: claim dispositions require review';
    }
    // §15.4 / §18.2 forcing reasons ride gate_reasons so the caller sees WHY
    // the run is advisory, not just that it is. Pushed after the tighten
    // checks above (they read reasons[0], which stays the resolver's own
    // reason) and before the downgrade note (cause before effect).
    if (gateNotes.length) resolverGate.reasons.push(...gateNotes);
    if (advisoryMode) {
      if (gateDecision === 'blocked') {
        gateDecision = 'requires_review';
        resolverGate.reasons.push('advisory mode: blocking outcome downgraded to requires_review');
      }
      if (statusState === 'failure') {
        statusState = 'success';
        statusDesc = `advisory: ${statusDesc}`;
      }
    }

    // ---- Set commit status ----
    await setCommitStatus(accessToken, owner, repo, head_sha, statusState, statusDesc, pull_number);

    // ---- Post PR review with inline annotations (best-effort) ----
    const reviewResult = await postPrReview(accessToken, owner, repo, pull_number, evaluatedClaims, gateDecision, statusDesc);

    // ---- Review handoff (§12.5): create Review rows for dispositions that ----
    // need human eyes. createReviewsForGate never throws by contract (fail
    // open, console.error) — the wrap is belt-and-suspenders so the wedge can
    // never fail because review bookkeeping failed.
    let reviewHandoff = { created: 0, review_ids: [] };
    try {
      const handoff = await createReviewsForGate(svc, {
        claims: persistedClaims,
        gate_decision: gateDecision,
        repo: `${owner}/${repo}`,
        pr_number: pull_number ?? null,
        policy,
        trace_id: traceId,
      });
      if (handoff && typeof handoff.created === 'number') reviewHandoff = handoff;
    } catch (e) {
      console.error('Review handoff failed:', e?.message || e);
    }

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
        claims_evaluated: claimsEvaluated,
        claims_reused: claimsReused,
        policy_source: policySource,
        policy_id: policy.policy_id,
        policy_hash: policy.policy_hash,
        flash_summary: flashResults.summary,
        gate_decision: gateDecision,
        resolver_version: RESOLVER_VERSION,
        advisory_mode: advisoryMode,
        service_mode: serviceMode.mode,
        github_operations_enabled: isAdmin,
        dispositions: dispositionCounts,
        reviews_created: reviewHandoff.created,
        notes: runNotes,
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
        materiality: c.materiality,
        flash_state: c.flash_state,
        flash_signals: c.flash_signals,
        policy_decision: c.policy_decision,
        policy_rule: c.policy_rule,
        disposition: c.disposition,
        evidence: c.evidence || [],
        independent_origins: c.independent_origins ?? null,
        independence_flags: c.independence_flags || [],
        file_path: c.file_path,
        diff_line: c.diff_line,
        reused: c.reused,
      })),
      flash_summary: flashResults.summary,
      policy: {
        source: policySource,
        policy_id: policy.policy_id,
        policy_hash: policy.policy_hash,
        default_action: policy.default_action,
        rules_count: policy.rules.length,
        mode: policy.mode === 'advisory' ? 'advisory' : 'enforcing',
      },
      gate_decision: gateDecision,
      gate_reasons: resolverGate.reasons,
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
      claims_evaluated: claimsEvaluated,
      claims_reused: claimsReused,
      claims_found: totalClaimsFound,
      resolver_version: RESOLVER_VERSION,
      advisory_mode: advisoryMode,
      github_operations_enabled: isAdmin,
      ...modeStamp,
      dispositions: dispositionCounts,
      reviews: reviewHandoff,
      notes: runNotes,
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

// Materiality fallback for v1 policies (no materiality_rules): derive from the
// claim's deterministic risk level so the resolver always has a signal. The v2
// parser's evaluatePolicy supersedes this by returning materiality with the
// policy's floors applied.
function materialityFromRisk(riskLevel) {
  if (riskLevel === 'critical') return 'critical';
  if (riskLevel === 'high') return 'high';
  if (riskLevel === 'low') return 'low';
  return 'normal';
}

// Extract deduped http(s) URLs cited in a claim's text, trailing punctuation trimmed.
const CITED_URL_RE = /https?:\/\/[^\s"'<>)\]]+/g;

function citedUrls(text) {
  const found = String(text || '').match(CITED_URL_RE) || [];
  return [...new Set(found.map((u) => u.replace(/[.,;:!?]+$/, '')))];
}

// Pack scope check — deterministic and defensive: only marks out_of_scope when
// the parsed policy carries a scope.ignore list (v2) and the claim's file path
// matches one of its globs. Absent scope info → in scope (never guess).
function isOutOfScopePath(policy, filePath) {
  const ignore = policy && policy.scope && Array.isArray(policy.scope.ignore) ? policy.scope.ignore : [];
  if (!ignore.length || !filePath) return false;
  return ignore.some((glob) => globToRegExp(glob).test(filePath));
}

function globToRegExp(glob) {
  const escaped = String(glob || '')
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\u0000/g, '.*')
    .replace(/\?/g, '[^/]');
  return new RegExp(`^${escaped}$`);
}

// Fetch one cited URL through attest.js's SSRF-guarded machinery and reduce it
// to the evidence fields the wedge records. Mirrors snapshotSources' outcome
// semantics (blocked / error / paywalled / thin); fetched_ok means the content
// is usable for grounding (2xx, not paywalled, not thin). Never throws. The
// full trimmed content stays in the run's snapshot cache for quote/version
// checks and is never returned to the caller.
const CITATION_MAX_BYTES = 200000;

async function snapshotCitation(url) {
  const fetched_at = new Date().toISOString();
  const failure = (status, error) => ({ fetched_at, fetched_ok: false, status, content_hash: null, content_length: 0, excerpt: '', http_date: null, content: '', ...(error ? { error } : {}) });
  try {
    if (!(await assertSafeSourceUrl(url))) return failure('blocked');
    const r = await safeFetchValidated(url);
    if (r.blocked) return failure('blocked', r.error);
    if (!r.res) return failure('error', r.error);
    const text = await r.res.text();
    const trimmed = text.slice(0, CITATION_MAX_BYTES);
    const httpDate = r.res.headers.get('date') || r.res.headers.get('last-modified') || null;
    let status = String(r.res.status);
    let usable = r.res.status >= 200 && r.res.status < 300;
    if (status === '401' || status === '403') { status = 'paywalled'; usable = false; }
    else if (text.length < 500) { status = 'thin'; usable = false; }
    return {
      fetched_at,
      fetched_ok: usable,
      status,
      content_hash: usable ? await sha256Hex(trimmed) : null,
      content_length: text.length,
      excerpt: usable ? trimmed.slice(0, 240) : '',
      http_date: httpDate,
      content: usable ? trimmed : '',
    };
  } catch (e) {
    return failure('error', String((e && e.message) || e).slice(0, 200));
  }
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