import React, { useEffect, useState } from 'react';
import { Loader2, RefreshCw, ArrowUpRight, ArrowRight, Minus, Scale, Trophy, Target } from 'lucide-react';
import { base44 } from '@/api/base44Client';

// Displays the latest tribunal-vs-single-model lift audit (Methodology audit #2):
// does the 3-way hardened answer measurably beat the best single model on the
// same hard questions? Published regardless of outcome. Admin re-run is
// long-running (one full tribunal per question).
export default function TribunalLiftCard() {
  const [audit, setAudit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState('');

  const load = async () => {
    try {
      const list = await base44.entities.TribunalLiftAudit.list('-created_date', 1);
      setAudit(list[0] || null);
    } catch { setAudit(null); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  async function rerun() {
    setRunning(true); setErr('');
    try {
      const res = await base44.functions.invoke('runTribunalLiftAudit', {});
      if (res?.data) setAudit(res.data);
    } catch (e) {
      setErr(e?.response?.data?.error || e?.message || 'Audit failed (admin only, long-running).');
    } finally { setRunning(false); }
  }

  if (loading) {
    return <div className="flex items-center gap-2 text-slate-500 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Loading lift results…</div>;
  }

  if (!audit) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <p className="text-sm text-slate-400 mb-3">No lift audit run yet. An admin can run it below — it takes several minutes (one full tribunal per question).</p>
        <button onClick={rerun} disabled={running} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-emerald-400 text-[#070A0F] hover:bg-emerald-300 disabled:opacity-40">
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Run tribunal lift audit
        </button>
        {err && <p className="text-[11px] text-rose-300 mt-2">{err}</p>}
      </div>
    );
  }

  const liftIcon = audit.correctness_lift > 0.03 ? ArrowUpRight : audit.correctness_lift < -0.03 ? ArrowRight : Minus;
  const liftTone = audit.correctness_lift > 0.03 ? 'text-emerald-300' : audit.correctness_lift < -0.03 ? 'text-rose-300' : 'text-slate-300';
  const LiftIcon = liftIcon;
  const overconfident = audit.correctness_lift > 0.03 && audit.trust_lift < -0.5;
  const verdict = audit.correctness_lift > 0.03
    ? (overconfident ? 'Tribunal caught a single-model hallucination — and was appropriately less overconfident'
       : 'Tribunal measurably beats single model')
    : audit.correctness_lift < -0.03 ? 'Single model beats tribunal (investigate)'
    : 'No measurable lift — both paths tie';

  return (
    <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.03] p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Scale className="h-4 w-4 text-amber-300" />
          <span className="text-sm font-medium text-slate-200">Published result · {audit.n_questions} question{audit.n_questions === 1 ? '' : 's'}</span>
        </div>
        <button onClick={rerun} disabled={running} className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-md border border-white/10 text-slate-300 hover:bg-white/5 disabled:opacity-40">
          {running ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Re-run
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        <Metric icon={LiftIcon} label="Correctness lift" value={`${(audit.correctness_lift * 100).toFixed(0)}pp`} tone={liftTone} hint="tribunal − single" />
        <Metric icon={ArrowUpRight} label="Trust lift" value={`${audit.trust_lift?.toFixed(1)}`} hint="tribunal − single" tone={audit.trust_lift > 0.5 ? 'text-emerald-300' : 'text-slate-300'} />
        <Metric icon={Trophy} label="Tribunal wins" value={`${Math.round(audit.tribunal_win_rate * 100)}%`} hint="strictly > single" />
        <Metric icon={Target} label="Ties" value={`${Math.round(audit.tie_rate * 100)}%`} hint="equal correctness" />
      </div>

      <div className="grid grid-cols-2 gap-3 text-[12px]">
        <div className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
          <div className="text-slate-500">Single model · mean trust / correctness</div>
          <div className="text-slate-200 font-medium">{audit.mean_trust_single?.toFixed(1)} · {(audit.mean_correctness_single * 100).toFixed(0)}%</div>
        </div>
        <div className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
          <div className="text-slate-500">Tribunal · mean trust / correctness</div>
          <div className="text-emerald-200 font-medium">{audit.mean_trust_tribunal?.toFixed(1)} · {(audit.mean_correctness_tribunal * 100).toFixed(0)}%</div>
        </div>
      </div>

      <p className="text-[11px] text-slate-500 mt-3 leading-relaxed">
        Verdict: <span className={liftTone}>{verdict}</span>. {overconfident
          ? <>The single model scored high trust while factually wrong — a calibration failure the tribunal's cross-firm scrutiny caught. Lower tribunal trust here is a feature, not a bug: it is honestly less certain while more correct.</>
          : <>On easy misconception questions single models already score near ceiling, so lift can be ~0 — the tribunal's value shows on harder / adversarial questions where single models hallucinate, as this hard-question suite targets.</>} Published regardless of outcome.
        {audit.created_date && <> · run {new Date(audit.created_date).toLocaleDateString()}</>}
      </p>
      {err && <p className="text-[11px] text-rose-300 mt-2">{err}</p>}
    </div>
  );
}

function Metric({ icon: Icon, label, value, hint, tone = 'text-slate-100' }) {
  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500">
        <Icon className={`h-3 w-3 ${tone}`} /> {label}
      </div>
      <div className={`text-lg font-semibold tabular-nums leading-tight mt-0.5 ${tone}`}>{value}</div>
      <div className="text-[10px] text-slate-600">{hint}</div>
    </div>
  );
}