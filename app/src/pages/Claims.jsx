import React, { useState, useEffect, useCallback } from 'react';
import { Search, ShieldCheck, AlertTriangle, ChevronDown, ChevronRight, Loader2, FileText, ExternalLink, Filter } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import AppShell from '@/components/sf2x/AppShell';
import { useToast } from '@/components/ui/use-toast';

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
};

function EvidencePackDetail({ claimId }) {
  const [pack, setPack] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    base44.entities.EvidencePack.filter({ claim_id: claimId }, '-created_date', 1)
      .then((res) => { if (active) { setPack(res[0] || null); setLoading(false); } })
      .catch(() => { if (active) { setLoading(false); } });
    return () => { active = false; };
  }, [claimId]);

  if (loading) return <div className="flex items-center gap-2 text-xs text-slate-500 py-2"><Loader2 className="h-3 w-3 animate-spin" /> Loading evidence…</div>;
  if (!pack) return <div className="text-xs text-slate-600 py-2">No evidence pack found.</div>;

  return (
    <div className="space-y-3">
      {/* Summary */}
      <div className="flex flex-wrap items-center gap-3 text-[10px] uppercase tracking-wide">
        <span className="text-slate-500">Authority: <span className={TIER_COLORS[pack.source_authority_summary] || 'text-slate-400'}>{pack.source_authority_summary?.replace(/_/g, ' ') || '—'}</span></span>
        <span className="text-slate-500">Freshness: <span className="text-slate-400">{pack.freshness_summary || '—'}</span></span>
        <span className="text-slate-500">Coverage: <span className={COVERAGE_COLORS[pack.coverage] || 'text-slate-400'}>{pack.coverage?.replace(/_/g, ' ') || '—'}</span></span>
        <span className="text-slate-500 font-mono">{pack.manifest_hash?.slice(0, 16) || 'no hash'}…</span>
      </div>

      {/* Sources */}
      {pack.sources && pack.sources.length > 0 ? (
        <div className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Sources ({pack.sources.length})</div>
          {pack.sources.map((s, i) => (
            <div key={i} className="flex items-start gap-2 text-xs border border-white/5 rounded px-2 py-1.5 bg-black/20">
              <span className={`mt-0.5 shrink-0 ${TIER_COLORS[s.authority_tier] || 'text-slate-500'}`}>●</span>
              <div className="flex-1 min-w-0">
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:text-sky-300 truncate block">
                  {s.url}
                </a>
                <div className="flex flex-wrap items-center gap-2 mt-0.5">
                  <span className={`text-[10px] ${TIER_COLORS[s.authority_tier] || 'text-slate-500'}`}>{s.authority_tier?.replace(/_/g, ' ')}</span>
                  <span className="text-[10px] text-slate-600">·</span>
                  <span className="text-[10px] text-slate-500">{s.freshness_status || 'unknown'}</span>
                  {s.quarantined && <span className="text-[10px] text-red-400">· quarantined ({s.quarantine_reason})</span>}
                  {s.content_hash && <span className="text-[10px] text-slate-600 font-mono">{s.content_hash.slice(0, 12)}…</span>}
                </div>
              </div>
              <ExternalLink className="h-3 w-3 text-slate-600 shrink-0 mt-0.5" />
            </div>
          ))}
        </div>
      ) : (
        <div className="text-xs text-slate-600">No sources cited.</div>
      )}

      {/* Supporting excerpts */}
      {pack.supporting_excerpts && pack.supporting_excerpts.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-[0.16em] text-emerald-400/70">Supporting Excerpts</div>
          {pack.supporting_excerpts.map((ex, i) => (
            <div key={i} className="text-xs text-slate-400 border-l-2 border-emerald-400/30 pl-2 py-0.5">
              "{ex.excerpt}" <span className="text-[10px] text-slate-600">· score {ex.match_score}</span>
            </div>
          ))}
        </div>
      )}

      {/* Conflicting excerpts */}
      {pack.conflicting_excerpts && pack.conflicting_excerpts.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-[0.16em] text-red-400/70">Conflicting Excerpts</div>
          {pack.conflicting_excerpts.map((ex, i) => (
            <div key={i} className="text-xs text-slate-400 border-l-2 border-red-400/30 pl-2 py-0.5">
              "{ex.excerpt}" <span className="text-[10px] text-slate-600">· score {ex.match_score}</span>
            </div>
          ))}
        </div>
      )}

      {/* Limitations */}
      {pack.limitations && pack.limitations.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-[0.16em] text-amber-400/70">Limitations</div>
          {pack.limitations.slice(0, 5).map((lim, i) => (
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
            <span className="text-[10px] text-slate-600">{claim.source_asset_type?.replace(/_/g, ' ')}</span>
            {claim.warrant_id && <span className="text-[10px] text-slate-600 font-mono">· warrant {claim.warrant_id.slice(0, 12)}…</span>}
            {claim.file_path && <span className="text-[10px] text-sky-400/60 font-mono">· {claim.file_path}:{claim.diff_line}</span>}
          </div>
        </div>
      </button>
      {expanded && (
        <div className="border-t border-white/10 px-4 py-3 bg-black/20">
          <EvidencePackDetail claimId={claim.id} />
        </div>
      )}
    </div>
  );
}

export default function Claims() {
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ category: '', verdict_status: '', risk_level: '', policy_decision: '' });
  const [stats, setStats] = useState({ total: 0, supported: 0, unsupported: 0, pending: 0, blocked: 0 });
  const { toast } = useToast();

  const loadClaims = useCallback(async () => {
    setLoading(true);
    try {
      const query = {};
      if (filters.category) query.category = filters.category;
      if (filters.verdict_status) query.verdict_status = filters.verdict_status;
      if (filters.risk_level) query.risk_level = filters.risk_level;
      if (filters.policy_decision) query.policy_decision = filters.policy_decision;
      const res = await base44.entities.Claim.filter(query, '-created_date', 100);
      let filtered = res;
      if (search.trim()) {
        const q = search.toLowerCase();
        filtered = res.filter((c) => c.text?.toLowerCase().includes(q));
      }
      setClaims(filtered);
      setStats({
        total: res.length,
        supported: res.filter((c) => c.verdict_status === 'supported' || c.verdict_status === 'supported_with_limits').length,
        unsupported: res.filter((c) => c.verdict_status === 'unsupported' || c.verdict_status === 'contradicted').length,
        pending: res.filter((c) => c.verdict_status === 'pending').length,
        blocked: res.filter((c) => c.policy_decision === 'block').length,
      });
    } catch (e) {
      toast({ title: 'Failed to load claims', description: e?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [filters, search, toast]);

  useEffect(() => { loadClaims(); }, [loadClaims]);

  const statCards = [
    { label: 'Total', value: stats.total, color: 'text-white' },
    { label: 'Supported', value: stats.supported, color: 'text-emerald-400' },
    { label: 'Unsupported', value: stats.unsupported, color: 'text-red-400' },
    { label: 'Pending', value: stats.pending, color: 'text-slate-400' },
    { label: 'Blocked', value: stats.blocked, color: 'text-red-400' },
  ];

  return (
    <AppShell>
      <div className="p-4 sm:p-6 space-y-5">
        {/* Header */}
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-emerald-400/80 mb-2">
            <FileText className="h-3.5 w-3.5" /> Claims Registry
          </div>
          <h1 className="font-heading text-2xl font-bold text-white">Claims & Evidence</h1>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl">
            Every claim extracted from tribunal verifications, PR diffs, and API attestations — each with its own evidence trail, verdict, and policy decision.
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
            <button onClick={loadClaims} className="ml-auto text-xs text-emerald-400 hover:text-emerald-300">Refresh</button>
          </div>
        </div>

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
              <ClaimRow key={claim.id || i} claim={claim} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}