import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ShieldCheck, ExternalLink, ArrowLeft, Activity, AlertTriangle, RefreshCw } from 'lucide-react';
import PublicNav from '@/components/sf2x/PublicNav';
import { base44 } from '@/api/base44Client';

function tone(score) {
  if (score == null) return { text: 'text-slate-400', ring: 'ring-slate-700', bar: 'bg-slate-600', label: 'Unknown' };
  if (score >= 80) return { text: 'text-emerald-300', ring: 'ring-emerald-500/40', bar: 'bg-emerald-500', label: 'High trust' };
  if (score >= 60) return { text: 'text-amber-300', ring: 'ring-amber-500/40', bar: 'bg-amber-500', label: 'Moderate' };
  return { text: 'text-rose-300', ring: 'ring-rose-500/40', bar: 'bg-rose-500', label: 'Low trust' };
}

function validityTone(status) {
  if (status === 'valid') return 'text-emerald-300 bg-emerald-400/10';
  if (status === 'weak') return 'text-amber-300 bg-amber-400/10';
  if (status === 'invalid') return 'text-rose-300 bg-rose-400/10';
  if (status === 'expired') return 'text-slate-300 bg-slate-400/10';
  return 'text-slate-400 bg-slate-400/10';
}

export default function Scorecard() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function load() {
    setLoading(true); setError(null);
    try {
      const res = await base44.functions.invoke('trustScorecard', { answer_version_id: id });
      setData(res.data);
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Not found');
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => { if (id) load(); /* eslint-disable-next-line */ }, [id]);

  const t = data ? tone(data.trust_score) : tone(null);

  return (
    <div className="min-h-screen bg-background text-foreground pb-[env(safe-area-inset-bottom)]">
      <PublicNav />
      <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 py-10">

        <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
          <Link to="/warrant-spec" className="hover:text-slate-300 flex items-center gap-1"><ArrowLeft className="h-3 w-3" /> Spec</Link>
          <span>/</span>
          <span className="text-slate-400">Trust Scorecard</span>
        </div>
        <h1 className="font-heading text-2xl font-semibold text-foreground tracking-tight">Trust Scorecard</h1>
        <p className="mt-1.5 text-sm text-slate-500">Independent, verifiable trust metrics for an attested AI answer.</p>

        {loading && (
          <div className="mt-10 flex items-center justify-center">
            <div className="w-7 h-7 border-4 border-slate-700 border-t-emerald-400 rounded-full animate-spin" />
          </div>
        )}

        {!loading && error && (
          <div className="mt-10 rounded-2xl border border-rose-500/30 bg-rose-500/5 p-6 text-center">
            <AlertTriangle className="h-6 w-6 text-rose-400 mx-auto mb-2" />
            <p className="text-sm text-rose-200">{error}</p>
            <button onClick={load} className="mt-4 inline-flex items-center gap-1.5 text-xs text-slate-300 hover:text-foreground">
              <RefreshCw className="h-3.5 w-3.5" /> Retry
            </button>
          </div>
        )}

        {!loading && data && (
          <div className="mt-8 space-y-4">
            <div className={`rounded-3xl border border-white/10 ${t.ring} ring-1 p-6 bg-card`}>
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Trust score</div>
                  <div className={`font-heading text-5xl font-semibold ${t.text} mt-1`}>{data.trust_score ?? '—'}<span className="text-xl text-slate-600">/100</span></div>
                  <div className={`text-xs ${t.text} mt-1`}>{t.label}</div>
                </div>
                <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full ${validityTone(data.warrant_status)}`}>{data.warrant_status}</span>
              </div>
              <div className="mt-4 h-2 w-full rounded-full bg-white/5 overflow-hidden">
                <div className={`h-full ${t.bar} transition-all`} style={{ width: `${Math.min(100, data.trust_score || 0)}%` }} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Metric icon={<Activity className="h-4 w-4" />} label="Warrant confidence" value={data.warrant_confidence != null ? `${Math.round(data.warrant_confidence * 100)}%` : '—'} />
              <Metric label="Corrections" value={data.corrections_count} />
              <Metric label="Drift score" value={data.drift_score != null ? Number(data.drift_score).toFixed(2) : '—'} />
              <Metric label="Version" value={data.version} />
            </div>

            <div className="rounded-2xl border border-white/10 bg-card p-4 text-xs text-slate-500 font-mono break-all">
              <div className="text-slate-600 mb-1">lineage_id</div>
              <div className="text-slate-300">{data.answer_version_id}</div>
            </div>

            <div className="flex items-center gap-3">
              <Link to={`/verify/${data.answer_version_id}`} className="inline-flex items-center gap-1.5 text-xs text-emerald-300 hover:text-emerald-200">
                <ExternalLink className="h-3.5 w-3.5" /> Full verification receipt
              </Link>
              <Link to={`/badge/${data.answer_version_id}`} className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200">
                <ExternalLink className="h-3.5 w-3.5" /> Embed badge
              </Link>
              <span className="ml-auto text-[11px] text-slate-600">Attested {new Date(data.created_date).toLocaleDateString()}</span>
            </div>
          </div>
        )}

        <footer className="mt-12 pt-6 border-t border-white/5 text-[11px] text-slate-600">
          SF2X · every scorecard is independently attested and signed.
        </footer>
      </div>
    </div>
  );
}

function Metric({ icon, label, value }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-card p-4">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-slate-500">{icon}{label}</div>
      <div className="mt-1.5 font-heading text-lg font-semibold text-foreground">{value}</div>
    </div>
  );
}