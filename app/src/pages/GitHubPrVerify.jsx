import React, { useState } from 'react';
import { GitBranch, ShieldCheck, AlertTriangle, FileText, File, Loader2, ChevronDown, ChevronRight, Copy, Check, ExternalLink, Zap } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';
import PublicNav from '@/components/sf2x/PublicNav';

const RISK_COLORS = {
  low: 'text-emerald-400 border-emerald-400/30 bg-emerald-400/5',
  medium: 'text-amber-400 border-amber-400/30 bg-amber-400/5',
  high: 'text-orange-400 border-orange-400/30 bg-orange-400/5',
  critical: 'text-red-400 border-red-400/30 bg-red-400/5',
};

const FLASH_COLORS = {
  clear: 'text-emerald-400',
  needs_support: 'text-amber-400',
  full_verification_required: 'text-red-400',
};

const POLICY_COLORS = {
  allow: 'text-emerald-400',
  warn: 'text-amber-400',
  require_verification: 'text-amber-400',
  require_review: 'text-orange-400',
  require_human_review: 'text-orange-400',
  block: 'text-red-400',
  pending: 'text-slate-400',
};

const SEVERITY_COLORS = {
  clear: 'text-emerald-400 border-emerald-400/20',
  info: 'text-sky-400 border-sky-400/20',
  warn: 'text-amber-400 border-amber-400/20',
  block: 'text-red-400 border-red-400/20',
};

const DISPOSITION_COLORS = {
  verified_for_stated_use: 'text-emerald-400 border-emerald-400/30 bg-emerald-400/5',
  supported_with_limits: 'text-emerald-300 border-emerald-300/30 bg-emerald-300/5',
  needs_review: 'text-amber-400 border-amber-400/30 bg-amber-400/5',
  contradicted: 'text-amber-500 border-amber-500/30 bg-amber-500/5',
  blocked: 'text-red-400 border-red-400/30 bg-red-400/5',
  not_supported: 'text-slate-400 border-slate-400/30 bg-slate-400/5',
  out_of_scope: 'text-slate-400 border-slate-400/30 bg-slate-400/5',
  unknown: 'text-slate-400 border-slate-400/30 bg-slate-400/5',
};

function ClaimRow({ claim, index }) {
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
            <span className="text-[10px] text-slate-500 uppercase tracking-wide">{claim.category}</span>
            <span className={`text-[10px] uppercase tracking-wide ${FLASH_COLORS[claim.flash_state] || 'text-slate-400'}`}>
              {claim.flash_state?.replace(/_/g, ' ')}
            </span>
            <span className={`text-[10px] uppercase tracking-wide font-medium ${POLICY_COLORS[claim.policy_decision] || 'text-slate-400'}`}>
              policy: {claim.policy_decision?.replace(/_/g, ' ')}
            </span>
            {claim.disposition && (
              <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border ${DISPOSITION_COLORS[claim.disposition] || DISPOSITION_COLORS.unknown}`}>
                {claim.disposition.replace(/_/g, ' ')}
              </span>
            )}
            {claim.reused && <span className="text-[10px] uppercase tracking-wide text-sky-400/80">reused</span>}
          </div>
        </div>
      </button>
      {expanded && ((claim.flash_signals && claim.flash_signals.length > 0) || (claim.evidence && claim.evidence.length > 0)) && (
        <div className="border-t border-white/10 px-4 py-3 space-y-2 bg-black/20">
          {claim.flash_signals && claim.flash_signals.length > 0 && (
            <>
              <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500 mb-1">Flash Signals</div>
              {claim.flash_signals.map((sig, i) => (
                <div key={i} className={`flex items-start gap-2 text-xs border rounded px-2 py-1.5 ${SEVERITY_COLORS[sig.severity] || SEVERITY_COLORS.warn}`}>
                  <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                  <div>
                    <span className="font-medium uppercase tracking-wide">{sig.category.replace(/_/g, ' ')}</span>
                    <span className="text-slate-400 ml-1">· {sig.severity}</span>
                    <p className="text-slate-400 mt-0.5 leading-relaxed">{sig.detail}</p>
                  </div>
                </div>
              ))}
            </>
          )}
          {claim.evidence && claim.evidence.length > 0 && (
            <>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Evidence</span>
                <span className="text-[10px] text-slate-500">
                  {claim.evidence.length} citation{claim.evidence.length === 1 ? '' : 's'}
                  {typeof claim.independent_origins === 'number' && ` · ${claim.independent_origins} independent origin${claim.independent_origins === 1 ? '' : 's'}`}
                </span>
                {claim.independence_flags && claim.independence_flags.includes('syndicated_copies') && (
                  <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border text-amber-400 border-amber-400/30 bg-amber-400/5">syndicated</span>
                )}
              </div>
              {claim.evidence.map((ev, i) => (
                <div key={i} className="text-xs border border-white/10 rounded px-2 py-1.5 space-y-1">
                  <a href={ev.url} target="_blank" rel="noreferrer" className="block font-mono text-sky-400 hover:text-sky-300 truncate">{ev.url}</a>
                  <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-wide">
                    <span className={ev.fetched_ok ? 'text-emerald-400' : 'text-red-400'}>fetch: {ev.status}</span>
                    <span className={ev.quote_present ? 'text-emerald-400' : 'text-amber-400'}>quote {ev.quote_present ? 'present' : 'not found'}</span>
                    {ev.applicability && (
                      <span className="text-slate-400">applicability: {ev.applicability.result?.replace(/_/g, ' ')}</span>
                    )}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Groups claims by claim.file_path, preserving first-seen order. Claims without
// a file_path (or with a falsy one) are bucketed under "Other".
function groupClaimsByFile(claims) {
  const groups = new Map();
  for (const claim of claims) {
    const key = claim.file_path || 'Other';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(claim);
  }
  return groups;
}

function FileGroup({ filePath, claims }) {
  const [expanded, setExpanded] = useState(true);
  return (
    <div className="border border-white/10 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left bg-white/[0.03] hover:bg-white/[0.05] transition-colors"
      >
        {expanded ? <ChevronDown className="h-3.5 w-3.5 text-slate-500 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-500 shrink-0" />}
        <File className="h-3.5 w-3.5 text-slate-500 shrink-0" />
        <span className="text-xs font-mono text-slate-300 truncate">{filePath}</span>
        <span className="ml-auto shrink-0 text-[10px] text-slate-500 bg-white/5 rounded-full px-2 py-0.5">{claims.length}</span>
      </button>
      {expanded && (
        <div className="p-2 space-y-2 bg-black/10">
          {claims.map((claim, i) => (
            <ClaimRow key={claim.id || `${filePath}-${i}`} claim={claim} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}

// Small inline note surfacing result.pr_review — shows nothing when pr_review
// is absent (older/different response shapes), an actionable success note
// with a link to the posted GitHub review when posted, or a muted explanation
// (not an error) when the connector couldn't post inline annotations.
function PrReviewNote({ prReview }) {
  if (!prReview) return null;
  if (prReview.posted) {
    const count = prReview.annotations ?? 0;
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs text-emerald-400/90 border border-emerald-400/20 rounded-lg px-3 py-2 bg-emerald-400/5">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
        <span>{count} annotation{count === 1 ? '' : 's'} posted as a GitHub PR review.</span>
        {prReview.review_url && (
          <a
            href={prReview.review_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 underline hover:text-emerald-300"
          >
            View review <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2 text-xs text-slate-500 border border-white/10 rounded-lg px-3 py-2 bg-white/[0.02]">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
      <span>
        Inline PR review annotations were not posted (likely missing <code className="text-slate-400">pulls:write</code> scope
        on the GitHub connector). The gate decision and commit status above are unaffected.
      </span>
    </div>
  );
}

// Builds a markdown summary of the verification result: gate decision, commit
// status, claim counts, policy info, PR review status, and claims grouped by
// file with their category/risk/flash_state/policy_decision.
function buildMarkdownReport(result) {
  const lines = [];
  lines.push('# Aether PR Verification Report');
  lines.push('');
  if (result.owner && result.repo) {
    lines.push(`**Repo:** ${result.owner}/${result.repo}${result.pull_number ? ` #${result.pull_number}` : ''}`);
  }
  if (result.head_sha) lines.push(`**Commit:** \`${result.head_sha}\``);
  lines.push(`**Gate Decision:** ${(result.gate_decision || 'unknown').replace(/_/g, ' ').toUpperCase()}${result.advisory_mode ? ' (advisory mode)' : ''}`);
  lines.push(`**Commit Status:** ${result.commit_status || 'unknown'}${result.commit_description ? ` — ${result.commit_description}` : ''}`);
  lines.push('');
  lines.push('## Claim Counts');
  lines.push(`- Total: ${result.claim_counts?.total ?? 0}`);
  lines.push(`- Blocked: ${result.claim_counts?.blocked ?? 0}`);
  lines.push(`- Require Review: ${result.claim_counts?.require_review ?? 0}`);
  lines.push(`- Warned: ${result.claim_counts?.warned ?? 0}`);
  lines.push(`- Clear: ${result.claim_counts?.clear ?? 0}`);
  lines.push('');
  lines.push('## Policy');
  lines.push(`- Source: ${result.policy?.source ?? 'n/a'}`);
  lines.push(`- Policy ID: ${result.policy?.policy_id ?? 'n/a'}`);
  lines.push(`- Rules: ${result.policy?.rules_count ?? 0}`);

  if (result.pr_review) {
    lines.push('');
    lines.push('## PR Review');
    if (result.pr_review.posted) {
      lines.push(`- Posted: yes (${result.pr_review.annotations ?? 0} annotation(s))`);
      if (result.pr_review.review_url) lines.push(`- Review URL: ${result.pr_review.review_url}`);
    } else {
      lines.push('- Posted: no (likely missing pulls:write scope on the GitHub connector)');
    }
  }

  lines.push('');
  lines.push('## Claims');
  const claims = result.claims || [];
  if (!claims.length) {
    lines.push('_No in-scope claims detected._');
  } else {
    for (const [filePath, groupClaims] of groupClaimsByFile(claims).entries()) {
      lines.push('');
      lines.push(`### ${filePath} (${groupClaims.length})`);
      for (const claim of groupClaims) {
        const category = claim.category || 'unknown';
        const risk = claim.risk_level || 'unknown';
        const flash = (claim.flash_state || 'unknown').replace(/_/g, ' ');
        const policy = (claim.policy_decision || 'unknown').replace(/_/g, ' ');
        const disposition = (claim.disposition || 'unknown').replace(/_/g, ' ');
        lines.push(`- [${category}] risk: ${risk} · flash: ${flash} · policy: ${policy} · disposition: ${disposition} — "${claim.text}"`);
      }
    }
  }

  return lines.join('\n');
}

function CopyMarkdownButton({ result }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(buildMarkdownReport(result));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={copy}
      className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 border border-white/10 rounded-lg px-2.5 py-1.5 transition-colors shrink-0"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? 'Copied' : 'Copy as Markdown'}
    </button>
  );
}

export default function GitHubPrVerify() {
  const [owner, setOwner] = useState('');
  const [repo, setRepo] = useState('');
  const [pullNumber, setPullNumber] = useState('');
  const [headSha, setHeadSha] = useState('');
  const [diffText, setDiffText] = useState('');
  const [domain, setDomain] = useState('general');
  const [policyYaml, setPolicyYaml] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const { toast } = useToast();

  const handleVerify = async () => {
    if (!diffText.trim() && (!owner || !repo)) {
      setError('Provide a diff text or owner + repo to fetch from GitHub.');
      return;
    }
    if (!headSha.trim()) {
      setError('head_sha (commit SHA) is required to set a status check.');
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const payload = {
        owner: owner || 'manual',
        repo: repo || 'manual',
        head_sha: headSha,
        domain,
      };
      if (diffText.trim()) payload.diff_text = diffText;
      if (pullNumber) payload.pull_number = parseInt(pullNumber, 10);
      if (policyYaml.trim()) payload.policy_yaml = policyYaml;

      const res = await base44.functions.invoke('githubPrVerify', payload);
      setResult(res.data);
      toast({ title: 'Verification complete', description: `${res.data.claim_counts?.total || 0} claims scanned` });
    } catch (e) {
      const msg = e?.response?.data?.error || e?.message || 'Verification failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const sampleDiff = `+ Our system is 100% secure and guaranteed to have zero vulnerabilities.
+ According to our latest benchmark, Aether reduces unsupported claims by 40%.
+ The API currently handles 1.2 million requests per second.
+ This implementation is fully compliant with GDPR and HIPAA requirements.`;

  return (
    <div className="min-h-screen bg-[#070A0F]">
      <PublicNav />
      <div className="mx-auto max-w-4xl px-4 sm:px-6 py-8 space-y-6">
        {/* Header */}
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-emerald-400/80 mb-2">
            <GitBranch className="h-3.5 w-3.5" /> GitHub PR Verification
          </div>
          <h1 className="font-heading text-2xl font-bold text-white">PR Claim Verification</h1>
          <p className="text-sm text-slate-500 mt-2 max-w-2xl">
            Extract claims from a GitHub PR diff, run Aether Flash deterministic risk detection, and evaluate each claim against your repo's <code className="text-slate-400">.aether/policy.yml</code>.
          </p>
        </div>

        {/* Input form */}
        <div className="border border-white/10 rounded-xl p-5 space-y-4 bg-white/[0.02]">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="owner" className="block text-xs font-medium text-slate-400 mb-1.5">Owner</label>
              <input
                id="owner"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                placeholder="octocat"
                className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-emerald-400/50 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="repo" className="block text-xs font-medium text-slate-400 mb-1.5">Repo</label>
              <input
                id="repo"
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
                placeholder="hello-world"
                className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-emerald-400/50 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="pr" className="block text-xs font-medium text-slate-400 mb-1.5">PR Number</label>
              <input
                id="pr"
                value={pullNumber}
                onChange={(e) => setPullNumber(e.target.value)}
                placeholder="42"
                className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-emerald-400/50 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label htmlFor="sha" className="block text-xs font-medium text-slate-400 mb-1.5">Head SHA (commit) *</label>
            <input
              id="sha"
              value={headSha}
              onChange={(e) => setHeadSha(e.target.value)}
              placeholder="abc123def456..."
              className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-emerald-400/50 focus:outline-none font-mono"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="diff" className="block text-xs font-medium text-slate-400">Diff Text</label>
              <button
                onClick={() => setDiffText(sampleDiff)}
                className="text-[11px] text-emerald-400 hover:text-emerald-300"
              >
                Load sample
              </button>
            </div>
            <textarea
              id="diff"
              value={diffText}
              onChange={(e) => setDiffText(e.target.value)}
              placeholder="Paste the PR diff here (lines starting with +)..."
              rows={6}
              className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-emerald-400/50 focus:outline-none font-mono"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="domain" className="block text-xs font-medium text-slate-400 mb-1.5">Domain</label>
              <select
                id="domain"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-400/50 focus:outline-none"
              >
                <option value="general">General</option>
                <option value="Medicine">Medicine</option>
                <option value="Finance">Finance</option>
                <option value="Legal">Legal</option>
                <option value="Engineering">Engineering</option>
                <option value="Science">Science</option>
              </select>
            </div>
            <div>
              <label htmlFor="policy" className="block text-xs font-medium text-slate-400 mb-1.5">Policy YAML (optional)</label>
              <input
                id="policy"
                value={policyYaml}
                onChange={(e) => setPolicyYaml(e.target.value)}
                placeholder="Leave empty to use repo .aether/policy.yml"
                className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-emerald-400/50 focus:outline-none font-mono"
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-red-400 border border-red-400/20 rounded-lg px-3 py-2 bg-red-400/5">
              <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
            </div>
          )}

          <button
            onClick={handleVerify}
            disabled={loading}
            className="w-full inline-flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-[#070A0F] font-semibold text-sm rounded-lg px-4 py-2.5 transition-colors"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            {loading ? 'Verifying…' : 'Verify PR Claims'}
          </button>
        </div>

        {/* Results */}
        {result && (
          <div className="space-y-4">
            {/* Results header */}
            <div className="flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Verification Results</div>
              <CopyMarkdownButton result={result} />
            </div>

            {/* Verdict reuse note — shown only when the delta rule saved work */}
            {result.claims_reused > 0 && (
              <div className="flex items-center gap-2 text-xs text-sky-400/90 border border-sky-400/20 rounded-lg px-3 py-2 bg-sky-400/5">
                <Zap className="h-3.5 w-3.5 shrink-0" />
                <span>{result.claims_reused} of {result.claim_counts?.total ?? 0} claim verdicts reused from cache.</span>
              </div>
            )}

            {/* Gate decision */}
            <div className={`border rounded-xl p-5 ${result.gate_decision === 'passed' ? 'border-emerald-400/30 bg-emerald-400/5' : result.gate_decision === 'blocked' ? 'border-red-400/30 bg-red-400/5' : 'border-amber-400/30 bg-amber-400/5'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500 mb-1">Gate Decision</div>
                  <div className={`text-lg font-bold ${result.gate_decision === 'passed' ? 'text-emerald-400' : result.gate_decision === 'blocked' ? 'text-red-400' : 'text-amber-400'}`}>
                    {result.gate_decision?.replace(/_/g, ' ').toUpperCase()}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">{result.commit_description}</p>
                  {result.advisory_mode && (
                    <p className="text-xs text-sky-400/90 mt-1">Advisory mode — findings reported, gate not enforced.</p>
                  )}
                  {(result.gate_reasons || [])
                    .filter((r) => typeof r === 'string' && (r.startsWith('enforcing requested but not unlocked') || r.startsWith('service mode ')))
                    .map((r, i) => (
                      <p key={i} className="text-xs text-amber-400/90 mt-1">{r}</p>
                    ))}
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500 mb-1">Commit Status</div>
                  <div className={`text-sm font-mono ${result.commit_status === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
                    {result.commit_status}
                  </div>
                </div>
              </div>
            </div>

            {/* PR review status */}
            <PrReviewNote prReview={result.pr_review} />

            {/* Claim counts */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {[
                { label: 'Total', value: result.claim_counts?.total || 0, color: 'text-white' },
                { label: 'Blocked', value: result.claim_counts?.blocked || 0, color: 'text-red-400' },
                { label: 'Review', value: result.claim_counts?.require_review || 0, color: 'text-orange-400' },
                { label: 'Warned', value: result.claim_counts?.warned || 0, color: 'text-amber-400' },
                { label: 'Clear', value: result.claim_counts?.clear || 0, color: 'text-emerald-400' },
              ].map((stat) => (
                <div key={stat.label} className="border border-white/10 rounded-lg p-3 text-center">
                  <div className={`text-2xl font-bold tabular-nums ${stat.color}`}>{stat.value}</div>
                  <div className="text-[10px] uppercase tracking-wide text-slate-500 mt-1">{stat.label}</div>
                </div>
              ))}
            </div>

            {/* Policy info */}
            <div className="border border-white/10 rounded-lg p-3 flex items-center gap-2 text-xs text-slate-400">
              <FileText className="h-3.5 w-3.5 shrink-0" />
              Policy source: <span className="text-slate-300">{result.policy?.source}</span>
              <span className="text-slate-600">·</span>
              <span className="font-mono text-slate-500">{result.policy?.policy_id}</span>
              <span className="text-slate-600">·</span>
              <span>{result.policy?.rules_count} rules</span>
            </div>

            {/* Claims list, grouped by file */}
            {result.claims && result.claims.length > 0 && (
              <div className="space-y-2">
                <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Extracted Claims</div>
                {Array.from(groupClaimsByFile(result.claims).entries()).map(([filePath, groupClaims]) => (
                  <FileGroup key={filePath} filePath={filePath} claims={groupClaims} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}