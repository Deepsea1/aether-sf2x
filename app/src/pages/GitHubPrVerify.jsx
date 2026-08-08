import React, { useState } from 'react';
import { GitBranch, ShieldCheck, AlertTriangle, FileText, Loader2, ChevronDown, ChevronRight } from 'lucide-react';
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
          </div>
        </div>
      </button>
      {expanded && claim.flash_signals && claim.flash_signals.length > 0 && (
        <div className="border-t border-white/10 px-4 py-3 space-y-2 bg-black/20">
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
        </div>
      )}
    </div>
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
            {/* Gate decision */}
            <div className={`border rounded-xl p-5 ${result.gate_decision === 'passed' ? 'border-emerald-400/30 bg-emerald-400/5' : result.gate_decision === 'blocked' ? 'border-red-400/30 bg-red-400/5' : 'border-amber-400/30 bg-amber-400/5'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500 mb-1">Gate Decision</div>
                  <div className={`text-lg font-bold ${result.gate_decision === 'passed' ? 'text-emerald-400' : result.gate_decision === 'blocked' ? 'text-red-400' : 'text-amber-400'}`}>
                    {result.gate_decision?.replace(/_/g, ' ').toUpperCase()}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">{result.commit_description}</p>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500 mb-1">Commit Status</div>
                  <div className={`text-sm font-mono ${result.commit_status === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
                    {result.commit_status}
                  </div>
                </div>
              </div>
            </div>

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

            {/* Claims list */}
            {result.claims && result.claims.length > 0 && (
              <div className="space-y-2">
                <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Extracted Claims</div>
                {result.claims.map((claim, i) => (
                  <ClaimRow key={claim.id || i} claim={claim} index={i} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}