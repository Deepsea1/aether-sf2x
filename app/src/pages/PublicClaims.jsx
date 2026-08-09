import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Search, ShieldCheck, ChevronDown, ChevronRight, Loader2, FileText, Filter, KeyRound, AlertTriangle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import PublicNav from '@/components/sf2x/PublicNav';

// Public, unauthenticated Claims browser — the read-only counterpart to
// /claims (which is auth-gated and shows every tenant's claim history).
//
// SCOPE: the Claim entity is multi-tenant (tenant_id, RLS-gated to the owning
// user/tenant or an admin), so an anonymous visitor cannot read it directly —
// base44.entities.Claim.filter() would just come back empty for a signed-out
// user. Instead this page calls the `searchClaims` backend function (the
// search_claims MCP tool, base44/functions/searchClaims/entry.ts), which runs
// as the service role and hard-scopes to is_public === true — an explicit,
// admin-settable publication flag on the Claim entity (field-level RLS
// restricts who can set it), never inferred from where a claim came from.
// Nothing sets it true yet, so this registry is expected to be empty today;
// that's the correct, safe starting state, not a bug. The function never
// returns tenant_id, actor_id, source_asset_id, source_asset_type, or
// source_excerpt regardless. This page reuses that same public-scoping
// decision rather than inventing a second one, and never renders any field
// searchClaims doesn't already return.
//
// Visual language borrowed from Claims.jsx (stat cards, filter bar,
// expand/collapse claim rows) and GitHubPrVerify.jsx (PublicNav + no-AppShell
// page shell) — see those files for the source of these conventions.

const RISK_COLORS = {
  low: 'text-emerald-400 border-emerald-400/30 bg-emerald-400/5',
  medium: 'text-amber-400 border-amber-400/30 bg-amber-400/5',
  high: 'text-orange-400 border-orange-400/30 bg-orange-400/5',
  critical: 'text-red-400 border-red-400/30 bg-red-400/5',
};

const VERDICT_COLORS = {
  pending: 'text-slate-400',
  supported: 'text-emerald-400',
  supported_with_limits: 'text-emerald-400',
  mixed: 'text-amber-400',
  unsupported: 'text-red-400',
  contradicted: 'text-red-400',
  unverifiable: 'text-slate-500',
  out_of_scope: 'text-slate-500',
};

const POLICY_COLORS = {
  pending: 'text-slate-400',
  allow: 'text-emerald-400',
  warn: 'text-amber-400',
  require_review: 'text-orange-400',
  block: 'text-red-400',
};

const COVERAGE_COLORS = {
  unverified: 'text-slate-500',
  sampled: 'text-amber-400',
  partial: 'text-amber-400',
  high_coverage: 'text-emerald-400',
  complete: 'text-emerald-400',
};

const TIER_COLORS = {
  primary_authoritative: 'text-emerald-400',
  primary_operational: 'text-emerald-400',
  qualified_secondary: 'text-amber-400',
  unverified_secondary: 'text-slate-500',
  user_supplied: 'text-sky-400',
  mixed: 'text-amber-400',
};

// searchClaims only returns an evidence *summary* per claim (counts +
// aggregate tier/freshness/coverage + limitations) — never the full source
// list, urls, or excerpts, since those can quote private diff content. This
// renders exactly what's available; it deliberately does not attempt to fetch
// the underlying EvidencePack directly (that entity is tenant-RLS-gated too,
// and duplicating searchClaims's public-scope decision in a second place is
// what we're avoiding).
function EvidenceSummary({ evidence }) {
  if (!evidence) return <div className="text-xs text-slate-600 py-2">No evidence pack found.</div>;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3 text-[10px] uppercase tracking-wide">
        <span className="text-slate-500">Authority: <span className={TIER_COLORS[evidence.source_authority_summary] || 'text-slate-400'}>{evidence.source_authority_summary?.replace(/_/g, ' ') || '—'}</span></span>
        <span className="text-slate-500">Freshness: <span className="text-slate-400">{evidence.freshness_summary || '—'}</span></span>
        <span className="text-slate-500">Coverage: <span className={COVERAGE_COLORS[evidence.coverage] || 'text-slate-400'}>{evidence.coverage?.replace(/_/g, ' ') || '—'}</span></span>
      </div>
      <div className="flex flex-wrap items-center gap-4 text-xs">
        <span className="text-slate-400">{evidence.source_count ?? 0} source{evidence.source_count === 1 ? '' : 's'}</span>
        <span className="text-emerald-400/80">{evidence.supporting_count ?? 0} supporting</span>
        <span className="text-red-400/80">{evidence.conflicting_count ?? 0} conflicting</span>
      </div>
      {evidence.limitations && evidence.limitations.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-[0.16em] text-amber-400/70">Limitations</div>
          {evidence.limitations.slice(0, 5).map((lim, i) => (
            <div key={i} className="text-xs text-slate-500">• {lim}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function ClaimRow({ claim }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="border border-white/10 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-start gap-3 p-4 text-left hover:bg-white/[0.03] transition-colors"
      >
        <span className="mt-0.5 shrink-0">
          {expanded ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronRight className="h-4 w-4 text-slate-500" />}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-slate-200 leading-relaxed">{claim.text}</p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border ${RISK_COLORS[claim.risk_level] || RISK_COLORS.medium}`}>
              {claim.risk_level}
            </span>
            <span className="text-[10px] text-slate-500 uppercase tracking-wide">{claim.category?.replace(/_/g, ' ')}</span>
            <span className={`text-[10px] uppercase tracking-wide ${VERDICT_COLORS[claim.verdict_status] || 'text-slate-400'}`}>
              {claim.verdict_status?.replace(/_/g, ' ')}
            </span>
            <span className={`text-[10px] uppercase tracking-wide font-medium ${POLICY_COLORS[claim.policy_decision] || 'text-slate-400'}`}>
              policy: {claim.policy_decision?.replace(/_/g, ' ')}
            </span>
            {claim.coverage_state && (
              <span className={`text-[10px] uppercase tracking-wide ${COVERAGE_COLORS[claim.coverage_state] || 'text-slate-500'}`}>
                {claim.coverage_state?.replace(/_/g, ' ')}
              </span>
            )}
            {claim.verdict_confidence != null && (
              <span className="text-[10px] text-slate-600">conf {(claim.verdict_confidence * 100).toFixed(0)}%</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <span className="text-[10px] text-slate-600">Published claim</span>
            {claim.created_date && <span className="text-[10px] text-slate-600">· {String(claim.created_date).slice(0, 10)}</span>}
            {claim.warrant_id && <span className="text-[10px] text-slate-600 font-mono">· warrant {String(claim.warrant_id).slice(0, 12)}…</span>}
          </div>
        </div>
      </button>
      {expanded && (
        <div className="border-t border-white/10 px-4 py-3 bg-black/20 space-y-3">
          <EvidenceSummary evidence={claim.evidence} />
          {claim.warrant_id && (
            <div className="pt-2 border-t border-white/5">
              <Link
                to={`/warrant-proof?q=${encodeURIComponent(claim.warrant_id)}`}
                className="inline-flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300"
              >
                <KeyRound className="h-3.5 w-3.5" /> View signed warrant proof →
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function PublicClaims() {
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ category: '', verdict_status: '', risk_level: '', policy_decision: '' });
  const [stats, setStats] = useState({ total: 0, supported: 0, unsupported: 0, pending: 0, blocked: 0 });

  const loadClaims = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = { limit: 100 };
      if (filters.category) payload.category = filters.category;
      if (filters.verdict_status) payload.verdict_status = filters.verdict_status;
      if (filters.risk_level) payload.risk_level = filters.risk_level;
      if (search.trim()) payload.text_query = search.trim();

      const res = await base44.functions.invoke('searchClaims', payload);
      const data = res?.data || res;
      const results = data?.results || [];

      const visible = filters.policy_decision
        ? results.filter((c) => c.policy_decision === filters.policy_decision)
        : results;

      setClaims(visible);
      setStats({
        total: results.length,
        supported: results.filter((c) => c.verdict_status === 'supported' || c.verdict_status === 'supported_with_limits').length,
        unsupported: results.filter((c) => c.verdict_status === 'unsupported' || c.verdict_status === 'contradicted').length,
        pending: results.filter((c) => c.verdict_status === 'pending').length,
        blocked: results.filter((c) => c.policy_decision === 'block').length,
      });
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Failed to load claims');
      setClaims([]);
    } finally {
      setLoading(false);
    }
  }, [filters, search]);

  useEffect(() => { loadClaims(); }, [loadClaims]);

  const statCards = [
    { label: 'Total', value: stats.total, color: 'text-white' },
    { label: 'Supported', value: stats.supported, color: 'text-emerald-400' },
    { label: 'Unsupported', value: stats.unsupported, color: 'text-red-400' },
    { label: 'Pending', value: stats.pending, color: 'text-slate-400' },
    { label: 'Blocked', value: stats.blocked, color: 'text-red-400' },
  ];

  return (
    <div className="min-h-screen bg-[#070A0F]">
      <PublicNav />
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-8 space-y-5">
        {/* Header */}
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-emerald-400/80 mb-2">
            <FileText className="h-3.5 w-3.5" /> Public Claims Registry
          </div>
          <h1 className="font-heading text-2xl font-bold text-white">Claims &amp; Evidence</h1>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl">
            Claims that have been explicitly published to this public registry, with each one's verdict,
            policy decision, and evidence summary. Publication is opt-in, not automatic — a claim only
            appears here once it has been deliberately marked public, so this list may be empty or sparse
            at any given time. Customer claims are private and never appear here. Don't trust us — check
            the record.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {statCards.map((s) => (
            <div key={s.label} className="border border-white/10 rounded-lg p-3 text-center">
              <div className={`text-2xl font-bold tabular-nums ${s.color}`}>{s.value}</div>
              <div className="text-[10px] uppercase tracking-wide text-slate-500 mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="border border-white/10 rounded-xl p-4 bg-white/[0.02] space-y-3">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Filter className="h-3.5 w-3.5" /> Filters
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="relative sm:col-span-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-600" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search claim text…"
                className="w-full bg-black/30 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-emerald-400/50 focus:outline-none"
              />
            </div>
            <select value={filters.category} onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}
              className="bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-400/50 focus:outline-none">
              <option value="">All categories</option>
              <option value="factual_claim">Factual</option>
              <option value="security_claim">Security</option>
              <option value="financial_claim">Financial</option>
              <option value="benchmark_claim">Benchmark</option>
              <option value="technical_claim">Technical</option>
              <option value="medical_claim">Medical</option>
              <option value="legal_claim">Legal</option>
              <option value="marketing_claim">Marketing</option>
              <option value="historical_claim">Historical</option>
              <option value="general_claim">General</option>
            </select>
            <select value={filters.verdict_status} onChange={(e) => setFilters((f) => ({ ...f, verdict_status: e.target.value }))}
              className="bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-400/50 focus:outline-none">
              <option value="">All verdicts</option>
              <option value="pending">Pending</option>
              <option value="supported">Supported</option>
              <option value="supported_with_limits">Supported (limits)</option>
              <option value="unsupported">Unsupported</option>
              <option value="contradicted">Contradicted</option>
              <option value="unverifiable">Unverifiable</option>
              <option value="mixed">Mixed</option>
            </select>
            <select value={filters.risk_level} onChange={(e) => setFilters((f) => ({ ...f, risk_level: e.target.value }))}
              className="bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-400/50 focus:outline-none">
              <option value="">All risks</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <select value={filters.policy_decision} onChange={(e) => setFilters((f) => ({ ...f, policy_decision: e.target.value }))}
              className="bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-400/50 focus:outline-none">
              <option value="">All policy decisions</option>
              <option value="pending">Pending</option>
              <option value="allow">Allow</option>
              <option value="warn">Warn</option>
              <option value="require_review">Require review</option>
              <option value="block">Block</option>
            </select>
            <span className="text-[10px] text-slate-600">(policy filter applies within the current page of results)</span>
            <button onClick={loadClaims} className="ml-auto text-xs text-emerald-400 hover:text-emerald-300">Refresh</button>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-red-400 border border-red-400/20 rounded-lg px-3 py-2 bg-red-400/5">
            <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
          </div>
        )}

        {/* Claims list */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
          </div>
        ) : claims.length === 0 ? (
          <div className="border border-white/10 rounded-xl p-8 text-center">
            <ShieldCheck className="h-8 w-8 text-slate-600 mx-auto mb-2" />
            <p className="text-sm text-slate-500">No claims found matching your filters.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {claims.map((claim, i) => (
              <ClaimRow key={claim.claim_id || i} claim={claim} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
