import React, { useEffect, useState } from 'react';
import { Loader2, RefreshCw, TrendingUp, Target, Sigma, Activity, Fingerprint } from 'lucide-react';
import { base44 } from '@/api/base44Client';

// Displays the latest self-audit: correlation between the SF2X trust score and
// ground-truth truthfulness on a representative TruthfulQA/HaluEval sample.
// Published regardless of outcome (per the Methodology audit roadmap). Admins
// can re-run the audit (it spends integration credits per item).
export default function CorrelationAuditCard() {
  const [audit, setAudit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState('');

  const load = async () => {
    try {
      const list = await base44.entities.CorrelationAudit.list('-created_date', 1);
      setAudit(list[0] || null);
    } catch { setAudit(null); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  async function rerun() {
    setRunning(true); setErr('');
    try {
      const res = await base44.functions.invoke('runCorrelationAudit', {});
      if (res?.data) setAudit(res.data);
    } catch (e) {
      setErr(e?.response?.data?.error || e?.message || 'Audit failed (admin only).');
    } finally { setRunning(false); }
  }

  if (loading) {
    return <div className="flex items-center gap-2 text-slate-500 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Loading audit results…</div>;
  }

  if (!audit) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <p className="text-sm text-slate-400 mb-3">No audit run yet. An admin can run it below (it spends integration credits).</p>
        <button onClick={rerun} disabled={running} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-emerald-400 text-[#070A0F] hover:bg-emerald-300 disabled:opacity-40">
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Run correlation audit
        </button>
        {err && <p className="text-[11px] text-rose-300 mt-2">{err}</p>}
      </div>
    );
  }

  const pct = (x) => `${Math.round(x * 100)}%`;

  return (
    <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.03] p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Fingerprint className="h-4 w-4 text-emerald-300" />
          <span className="text-sm font-medium text-slate-200">Published result · {audit.dataset}</span>
        </div>
        <button onClick={rerun} disabled={running} className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-md border border-white/10 text-slate-300 hover:bg-white/5 disabled:opacity-40">
          {running ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Re-run
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        <Metric icon={TrendingUp} label="Pearson r" value={audit.pearson_r?.toFixed(2)} hint="trust ↔ truth" />
        <Metric icon={Sigma} label="Spearman ρ" value={audit.spearman_rho?.toFixed(2)} hint="rank corr" />
        <Metric icon={Target} label="ROC AUC" value={audit.auc?.toFixed(2)} hint="classifier" />
        <Metric icon={Activity} label="Accuracy" value={pct(audit.accuracy)} hint={`@ trust ≥ ${audit.threshold}`} />
      </div>

      <div className="grid grid-cols-2 gap-3 text-[12px]">
        <div className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
          <div className="text-slate-500">Mean trust · true claims</div>
          <div className="text-emerald-300 font-medium">{audit.mean_trust_true?.toFixed(1)}</div>
        </div>
        <div className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
          <div className="text-slate-500">Mean trust · hallucinated</div>
          <div className="text-rose-300 font-medium">{audit.mean_trust_false?.toFixed(1)}</div>
        </div>
      </div>

      <p className="text-[11px] text-slate-500 mt-3 leading-relaxed">
        {audit.n_items} items ({audit.n_true} true / {audit.n_hallucinated} hallucinated) · separation {audit.separation?.toFixed(1)} trust points.
        Representative sample from the public TruthfulQA/HaluEval distribution, not the licensed datasets verbatim. Published regardless of outcome.
        {audit.created_date && <> · run {new Date(audit.created_date).toLocaleDateString()}</>}
      </p>
      {err && <p className="text-[11px] text-rose-300 mt-2">{err}</p>}
    </div>
  );
}

function Metric({ icon: Icon, label, value, hint }) {
  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className="text-lg font-semibold text-slate-100 tabular-nums leading-tight mt-0.5">{value}</div>
      <div className="text-[10px] text-slate-600">{hint}</div>
    </div>
  );
}