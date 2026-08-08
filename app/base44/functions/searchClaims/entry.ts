import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Public, read-only Claims search — the MCP `search_claims` tool and the data source for the
// public claims registry page.
//
// PUBLIC SCOPE — the one rule this file exists to enforce.
// The Claim entity is multi-tenant: rows carry tenant_id and most originate from customers'
// private tribunal runs and private-repository PR gates. This endpoint is unauthenticated, so it
// is hard-scoped to the explicit publication flag `is_public: true` (see entities/Claim.jsonc)
// and nothing else. `is_public` is a deliberate publication decision made by application code at
// the point of publishing; it is never inferred.
//
// DO NOT re-scope this to source_asset_type, category, tenant_id, or any other field that
// describes where a claim came from. That exact substitution shipped once and leaked: an earlier
// version of this file scoped to source_asset_type === 'pr_diff' believing it meant "Aether's own
// public transparency claims". It does not — functions/githubPrVerify is an AUTHENTICATED,
// per-customer endpoint that stamps that same value on every customer's claims, and Claim.text
// for those rows is the verbatim added lines of the customer's diff (shared/claimExtractor.js).
// The result was every tenant's private source code, unauthenticated and full-text searchable.
// That commit was reverted; this is its replacement. Origin is not consent.
//
// Consequence, and it is intended: nothing in this codebase sets is_public = true, so this
// endpoint returns an empty result set today. An empty public registry is the correct, safe
// starting state. If you are here because "it returns nothing", the fix is a deliberate
// publication mechanism upstream — NOT a wider filter here.
//
// Field selection: for a claim that genuinely IS published, returning its text is the point of a
// public claims registry. Identifying fields are still withheld unconditionally — tenant_id,
// actor_id (should the entity ever gain one), source_asset_id, source_asset_type and
// source_excerpt are never returned, and the EvidencePack join is aggregates only (counts and
// summary tiers), never raw source URLs or excerpts.

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
// Text search is a substring match applied after fetching (mirrors Claims.jsx's own client-side
// search), so over-fetch a bounded amount before narrowing. Never unbounded.
const TEXT_SCAN_CAP = 500;
const MAX_TEXT_QUERY_LEN = 200;

// The ONLY caller-supplied keys that may ever reach the entity filter. `is_public` is
// deliberately absent from this list and must never be added — it is not a caller's decision.
const CALLER_FILTER_KEYS = ['category', 'verdict_status', 'risk_level'];

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;

    const parsed = await req.json().catch(() => ({}));
    // Only a plain object can contribute filter values; arrays/strings/null collapse to {}.
    const body = (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};

    const rawLimit = Number(body.limit);
    const limit = Math.min(
      Math.max(Number.isFinite(rawLimit) && rawLimit > 0 ? Math.floor(rawLimit) : DEFAULT_LIMIT, 1),
      MAX_LIMIT,
    );
    const textQuery = String(body.text_query || '').trim().toLowerCase().slice(0, MAX_TEXT_QUERY_LEN);

    // Defensive filter construction: a fresh object literal, the hard public scope written first,
    // then only the fixed allowlist of caller keys merged in, each String()-coerced so a caller
    // cannot smuggle an operator object (e.g. { $ne: null }) into a filter value.
    const filter = { is_public: true };
    for (const key of CALLER_FILTER_KEYS) {
      const value = body[key];
      if (value !== undefined && value !== null && value !== '') {
        filter[key] = String(value);
      }
    }
    // Belt and braces: the allowlist above already makes this unreachable, but re-assert the hard
    // scope after the merge so no future edit to that loop can widen it by accident.
    filter.is_public = true;

    const fetchLimit = textQuery ? Math.min(limit * 5, TEXT_SCAN_CAP) : limit;
    const claims = await svc.entities.Claim.filter(filter, '-created_date', fetchLimit).catch(() => []);

    const matched = (textQuery
      ? (claims || []).filter((c) => String(c.text || '').toLowerCase().includes(textQuery))
      : (claims || [])
    ).slice(0, limit);

    // One evidence pack per claim, fetched in parallel — sequential would be up to MAX_LIMIT
    // round trips. Aggregates only: counts and summary tiers, never source urls or excerpts.
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
      scope: 'is_public_true',
      results,
    });
  } catch (error) {
    console.error('searchClaims error', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
