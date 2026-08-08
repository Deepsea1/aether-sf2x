import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ShieldCheck, ShieldAlert, Loader2, ExternalLink } from 'lucide-react';
import { base44 } from '@/api/base44Client';

function toneFor(t) {
  if (t >= 80) return { text: 'text-emerald-300', ring: 'ring-emerald-400/40', dot: 'bg-emerald-400', bar: 'bg-emerald-400' };
  if (t >= 60) return { text: 'text-amber-300', ring: 'ring-amber-400/40', dot: 'bg-amber-400', bar: 'bg-amber-400' };
  return { text: 'text-rose-300', ring: 'ring-rose-400/40', dot: 'bg-rose-400', bar: 'bg-rose-400' };
}

export default function Badge() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await base44.functions.invoke('trustScore', { answer_version_id: id });
        setData(res?.data || res);
      } catch (e) {
        setErr(e?.message || 'Unavailable');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const trust = data?.trust_score ?? 0;
  const tone = toneFor(trust);
  const verified = data?.signature_valid && data?.warrant?.validity_status === 'valid';

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#070A0F] p-4">
      <a
        href={`/verify/${id}`}
        target="_blank"
        rel="noreferrer"
        className="block w-full max-w-sm rounded-2xl border border-white/10 bg-[#0B0F16] p-5 hover:border-white/20 transition-colors ring-1 ring-white/5"
      >
        <div className="flex items-center gap-2.5 mb-4">
          <div className="relative">
            <div className="absolute inset-0 blur-md bg-emerald-400/40 rounded-lg" />
            <div className="relative h-8 w-8 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center">
              <ShieldCheck className="h-4 w-4 text-[#070A0F]" strokeWidth={2.5} />
            </div>
          </div>
          <div className="leading-tight">
            <div className="font-heading text-sm font-semibold text-white">Verified by AETHER</div>
            <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Epistemic receipt · SF2X</div>
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-6 text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        )}

        {!loading && err && (
          <div className="flex items-center gap-2 text-xs text-rose-300 py-3">
            <ShieldAlert className="h-4 w-4" /> {err}
          </div>
        )}

        {!loading && data && (
          <>
            <div className="flex items-end justify-between mb-3">
              <div>
                <div className={`text-4xl font-semibold tabular-nums leading-none ${tone.text}`}>{trust}</div>
                <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500 mt-1">Trust / 100</div>
              </div>
              <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full ring-1 ${tone.ring} ${tone.text} ${tone.bg}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
                {verified ? 'Seal intact' : 'Unverified'}
              </span>
            </div>

            <div className="h-1.5 rounded-full bg-white/5 overflow-hidden mb-3">
              <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${Math.max(2, Math.min(100, trust))}%` }} />
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <Metric label="Warrant" value={data.warrant?.validity_status || '—'} />
              <Metric label="Confidence" value={data.warrant ? `${Math.round((data.warrant.confidence_score || 0) * 100)}%` : '—'} />
              <Metric label="Sources" value={`${data.warrant?.sources_count ?? 0}`} />
            </div>
          </>
        )}

        <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-[10px] text-slate-500">
          <span className="font-mono">v{data?.version ?? '—'}</span>
          <span className="inline-flex items-center gap-1 text-emerald-300/80">View full proof <ExternalLink className="h-3 w-3" /></span>
        </div>
      </a>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="rounded-lg bg-white/[0.03] border border-white/5 px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-slate-600 truncate">{label}</div>
      <div className="text-xs text-slate-200 mt-0.5 truncate capitalize">{value}</div>
    </div>
  );
}