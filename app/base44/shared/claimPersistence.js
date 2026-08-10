// Claim persistence bridge — connects the tribunal/attestation verification
// output (ver.claims) to the Claim-centric data model. For each atomic claim
// the verifier decomposed, creates a discrete Claim record + an EvidencePack
// backing it, and links them back to the Warrant + AnswerVersion.
//
// This is the bridge between the "warrant-only" model and the "claim-level
// auditability" model: every claim is now independently queryable, each with
// its own evidence trail, verdict, and policy decision.

import { classifyClaim } from './claimExtractor.js';

async function sha256hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text ?? '')));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Map the verifier's supported/confidence to the Claim verdict taxonomy.
function verdictFromClaim(c) {
  if (c.supported && c.authoritative_grounding) return 'supported';
  if (c.supported) return 'supported_with_limits';
  return 'unsupported';
}

// Build an EvidencePack's sources array from the grounding data.
function buildSources(sources, grounded) {
  const perSource = grounded?.per_source || [];
  const sourceMap = new Map(perSource.map((s) => [s.url, s]));
  return (sources || []).map((url) => {
    const g = sourceMap.get(url) || {};
    return {
      url,
      publisher: '',
      author: '',
      capture_time: g.fetched_at || new Date().toISOString(),
      source_version: g.content_hash || null,
      content_hash: g.content_hash || null,
      authority_tier: mapTier(g.tier),
      freshness_days: null,
      freshness_status: 'unknown',
      retraction_status: 'none',
      quarantined: g.status === 'blocked' || g.status === 'error',
      quarantine_reason: g.status === 'blocked' ? 'SSRF-blocked' : (g.status === 'error' ? 'fetch error' : null),
    };
  });
}

function mapTier(tier) {
  switch (tier) {
    case 'T1': return 'primary_authoritative';
    case 'T2': return 'primary_operational';
    case 'T3': return 'qualified_secondary';
    case 'T4': return 'unverified_secondary';
    default: return 'unverified_secondary';
  }
}

function summarizeAuthority(sources) {
  if (!sources || !sources.length) return 'unverified_secondary';
  const tiers = sources.map((s) => s.authority_tier);
  if (tiers.every((t) => t === 'primary_authoritative')) return 'primary_authoritative';
  if (tiers.includes('primary_authoritative')) return 'mixed';
  if (tiers.every((t) => t === 'primary_operational' || t === 'primary_authoritative')) return 'primary_operational';
  if (tiers.includes('primary_operational')) return 'mixed';
  return 'qualified_secondary';
}

function summarizeFreshness(sources) {
  if (!sources || !sources.length) return 'unknown';
  const statuses = sources.map((s) => s.freshness_status || 'unknown');
  if (statuses.every((s) => s === 'current')) return 'current';
  if (statuses.every((s) => s === 'stale')) return 'stale';
  if (statuses.includes('current') && statuses.includes('stale')) return 'mixed';
  return 'unknown';
}

function coverageFromGrounding(grounded, supported) {
  if (!grounded) return 'unverified';
  if (grounded.n_fetched === 0) return 'unverified';
  if (grounded.n_matched === 0) return 'sampled';
  if (grounded.weighted_grounding_ratio > 0.7) return 'high_coverage';
  if (grounded.weighted_grounding_ratio > 0.4) return 'partial';
  return 'sampled';
}

/**
 * Persist Claim + EvidencePack records from a verification result.
 *
 * @param {object} svc - base44.asServiceRole client
 * @param {object} opts
 * @param {object} opts.ver - the runVerification() result (has .claims, .grounded, .issues)
 * @param {string} opts.warrantId - the Warrant id backing these claims
 * @param {string} opts.answerVersionId - the AnswerVersion id the claims came from
 * @param {string} opts.tenantId - tenant isolation key
 * @param {string} opts.domain - knowledge domain
 * @returns {Promise<{claimIds: string[], evidencePackIds: string[]}>}
 */
export async function persistClaimsAndEvidence(svc, {
  ver, warrantId, answerVersionId, tenantId, domain = 'general', sources = [],
}) {
  if (!ver || !Array.isArray(ver.claims) || !ver.claims.length) {
    return { claimIds: [], evidencePackIds: [] };
  }

  const sourceList = Array.isArray(sources) ? sources : [];
  const grounded = ver.grounded || null;
  const evidenceSources = buildSources(sourceList, grounded);

  const claimIds = [];
  const evidencePackIds = [];

  for (const c of ver.claims) {
    const claimText = String(c.claim || '').slice(0, 2000);
    if (!claimText.trim()) continue;

    const category = classifyClaim(claimText);
    const verdictStatus = verdictFromClaim(c);
    const riskLevel = (category === 'security_claim' || category === 'medical_claim' || category === 'legal_claim')
      ? (c.supported ? 'medium' : 'high')
      : (c.supported ? 'low' : 'medium');

    // Create the Claim record.
    let claimRecord;
    try {
      claimRecord = await svc.entities.Claim.create({
        text: claimText,
        category,
        subject: null,
        predicate: null,
        object: null,
        risk_level: riskLevel,
        extraction_confidence: Number(c.confidence) || 0,
        source_asset_type: 'answer_version',
        source_asset_id: answerVersionId,
        source_excerpt: claimText.slice(0, 500),
        flash_signals: [],
        verdict_status: verdictStatus,
        verdict_confidence: Number(c.confidence) || 0,
        coverage_state: coverageFromGrounding(grounded, c.supported),
        policy_decision: 'pending',
        evidence_pack_id: null,
        warrant_id: warrantId,
        tenant_id: tenantId,
        description: `Tribunal claim · ${verdictStatus} · confidence ${(Number(c.confidence) || 0).toFixed(2)} · ${c.note || ''}`.slice(0, 1000),
      });
      claimIds.push(claimRecord.id);
    } catch (e) {
      console.error('Claim persist failed:', e?.message || e);
      continue;
    }

    // Create the EvidencePack backing this claim.
    const manifestContent = JSON.stringify({
      claim_id: claimRecord.id,
      claim_text: claimText,
      sources: evidenceSources.map((s) => ({ url: s.url, hash: s.content_hash })),
      supported: c.supported,
      confidence: c.confidence,
    });
    const manifestHash = await sha256hex(manifestContent);

    // Split sources into supporting/conflicting based on match score.
    const supportingExcerpts = [];
    const conflictingExcerpts = [];
    if (grounded?.per_source) {
      for (const ps of grounded.per_source) {
        if (ps.excerpt_found && ps.match_score > 0.5) {
          supportingExcerpts.push({ source_url: ps.url, excerpt: '(matched via content hash)', match_score: ps.match_score });
        }
      }
    }

    try {
      const ep = await svc.entities.EvidencePack.create({
        claim_id: claimRecord.id,
        sources: evidenceSources,
        supporting_excerpts: supportingExcerpts,
        conflicting_excerpts: conflictingExcerpts,
        source_authority_summary: summarizeAuthority(evidenceSources),
        freshness_summary: summarizeFreshness(evidenceSources),
        coverage: coverageFromGrounding(grounded, c.supported),
        limitations: (ver.issues || []).slice(0, 5),
        manifest_hash: manifestHash,
        tenant_id: tenantId,
        description: `Evidence for claim ${claimRecord.id} · ${evidenceSources.length} sources · ${c.supported ? 'supported' : 'unsupported'}`.slice(0, 1000),
      });
      evidencePackIds.push(ep.id);

      // Back-link the evidence pack on the Claim.
      await svc.entities.Claim.update(claimRecord.id, { evidence_pack_id: ep.id }).catch(() => {});
    } catch (e) {
      console.error('EvidencePack persist failed:', e?.message || e);
    }
  }

  // Audit log entry for the claim persistence.
  try {
    await svc.entities.AuditLog.create({
      event_type: 'claim_extracted',
      entity_type: 'Warrant',
      entity_id: warrantId,
      actor_id: tenantId,
      tenant_id: tenantId,
      summary: `${claimIds.length} claims persisted with ${evidencePackIds.length} evidence packs · warrant ${warrantId}`,
      metadata: {
        warrant_id: warrantId,
        answer_version_id: answerVersionId,
        claim_count: claimIds.length,
        evidence_pack_count: evidencePackIds.length,
        supported: ver.claims.filter((c) => c.supported).length,
        unsupported: ver.claims.filter((c) => !c.supported).length,
      },
    });
  } catch (e) {
    console.error('Claim audit log failed:', e?.message || e);
  }

  return { claimIds, evidencePackIds };
}

// ---- Wedge evidence persistence (P3 Mission A, plan §5.4/§10) --------------
// Persist one EvidencePack for a PR-wedge claim from its per-citation evidence
// records (produced in githubPrVerify). Each source row carries the locator,
// quote_present (deterministic 8+ word containment), and the applicability v1
// assessment, so the pack is auditable without refetching. Fail open by
// design: evidence bookkeeping must never fail the wedge — errors are logged
// and swallowed, and the function never throws.
export async function persistClaimEvidence(svc, { claimId, tenantId, claimText = '', citations = [] }) {
  const cits = Array.isArray(citations) ? citations : [];
  if (!claimId || !cits.length) return { evidencePackId: null };
  try {
    const sources = cits.map((c) => ({
      url: c.url,
      publisher: '',
      author: '',
      capture_time: c.fetched_at || new Date().toISOString(),
      source_version: c.content_hash || null,
      content_hash: c.content_hash || null,
      locator: c.locator || { type: 'url', value: c.url },
      quote_present: c.quote_present === true,
      applicability: c.applicability || null,
      authority_tier: mapTier(c.tier),
      freshness_days: null,
      freshness_status: 'unknown',
      retraction_status: 'none',
      quarantined: c.status === 'blocked' || c.status === 'error',
      quarantine_reason: c.status === 'blocked' ? 'SSRF-blocked' : (c.status === 'error' ? 'fetch error' : null),
    }));
    const supportingExcerpts = cits
      .filter((c) => c.quote_present === true)
      .map((c) => ({ source_url: c.url, excerpt: c.excerpt || '(quote matched in fetched content)', match_score: 1 }));
    const fetchedAny = cits.some((c) => c.fetched_ok === true);
    const coverage = supportingExcerpts.length ? 'partial' : (fetchedAny ? 'sampled' : 'unverified');
    const manifestHash = await sha256hex(JSON.stringify({
      claim_id: claimId,
      claim_text: String(claimText || '').slice(0, 2000),
      sources: sources.map((s) => ({ url: s.url, hash: s.content_hash, quote_present: s.quote_present })),
    }));
    const ep = await svc.entities.EvidencePack.create({
      claim_id: claimId,
      sources,
      supporting_excerpts: supportingExcerpts,
      conflicting_excerpts: [],
      source_authority_summary: summarizeAuthority(sources),
      freshness_summary: summarizeFreshness(sources),
      coverage,
      limitations: ['Deterministic wedge grounding: quote containment + applicability v1 only — no model verification ran.'],
      manifest_hash: manifestHash,
      tenant_id: tenantId,
      description: `Wedge evidence for claim ${claimId} · ${sources.length} citation(s) · ${supportingExcerpts.length} quote match(es)`.slice(0, 1000),
    });
    await svc.entities.Claim.update(claimId, { evidence_pack_id: ep.id, coverage_state: coverage }).catch(() => {});
    return { evidencePackId: ep.id };
  } catch (e) {
    console.error('Wedge evidence persist failed:', e?.message || e);
    return { evidencePackId: null };
  }
}