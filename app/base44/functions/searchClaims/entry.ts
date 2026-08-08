import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Public, read-only Claims search — the MCP `search_claims` tool. Lets an MCP
// client explore Aether's claim-verification registry: what was claimed, how it
// was adjudicated, and what evidence backs the verdict.
//
// PUBLIC SCOPE — deliberately narrower than the Claim entity as a whole.
// Claim rows are multi-tenant (they carry tenant_id) and most originate from
// customers' private tribunal runs. This endpoint is unauthenticated, matching
// warrantRegistry's transparency posture, so it is hard-scoped to
// source_asset_type === 'pr_diff' — the GitHub PR verification claims that are
// intended as a public transparency proof — and never returns tenant_id,
// source_asset_id, or source_excerpt (which can quote private diff content).
// Do not widen this scope without an auth gate; an unscoped public search over
// Claim would expose every tenant's claim history.

const PUBLIC_SOURCE_ASSET_TYPE = 'pr_diff';
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
// Text search is a substring match applied after fetching (mirrors Claims.jsx's
// own client-side search), so over-fetch a bounded amount before narrowing.
const TEXT_SCAN_CAP = 500;

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;
    const body = await req.json().catch(() => ({}));

    const rawLimit = Number(body.limit);
    const limit = Math.min(Math.max(Number.isFinite(rawLimit) && rawLimit > 0 ? Math.floor(rawLimit) : DEFAULT_LIMIT, 1), MAX_LIMIT);
    const textQuery = String(body.text_query || '').trim().toLowerCase();

    const filter = { source_asset_type: PUBLIC_SOURCE_ASSET_TYPE };
    if (body.category) filter.category = String(body.category);
    if (body.verdict_status) filter.verdict_status = String(body.verdict_status);
    if (body.risk_level) filter.risk_level = String(body.risk_level);

    const fetchLimit = textQuery ? Math.min(limit * 5, TEXT_SCAN_CAP) : limit;
    const claims = await svc.entities.Claim.filter(filter, '-created_date', fetchLimit).catch(() => []);

    const matched = (textQuery
      ? (claims || []).filter((c) => String(c.text || '').toLowerCase().includes(textQuery))
      : (claims || [])
    ).slice(0, limit);

    // One evidence pack per claim, fetched in parallel — sequential would be
    // up to MAX_LIMIT round trips.
    const results = await Promise.all(matched.map(async (c) => {
      const packs = await svc.entities.EvidencePack.filter({ claim_id: c.id }, '-created_date', 1).catch(() => []);
      const pack = (packs && packs[0]) || null;
      return {
        claim_id: c.id,
        text: c.text,
        category: c.category,
        risk_level: c.risk_level,
        verdict_status: c.verdict_status,
        verdict_confidence: c.verdict_confidence ?? null,
        coverage_state: c.coverage_state,
        policy_decision: c.policy_decision,
        warrant_id: c.warrant_id || null,
        created_date: c.created_date,
        evidence: pack ? {
          source_count: (pack.sources || []).length,
          supporting_count: (pack.supporting_excerpts || []).length,
          conflicting_count: (pack.conflicting_excerpts || []).length,
          coverage: pack.coverage || null,
          source_authority_summary: pack.source_authority_summary || '',
          freshness_summary: pack.freshness_summary || '',
          limitations: pack.limitations || [],
        } : null,
      };
    }));

    return Response.json({
      count: results.length,
      limit,
      scope: 'public_pr_diff_claims',
      results,
    });
  } catch (error) {
    console.error('searchClaims error', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
