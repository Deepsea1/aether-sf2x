import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ShieldCheck, ShieldAlert, Loader2, ExternalLink } from 'lucide-react';
import { base44 } from '@/api/base44Client';

// Public, iframe-embeddable trust badge. Honors ?style= full (default) | compact | pill | score.

function toneFor(t) {
  if (t >= 80) return { text: 'text-emerald-300', ring: 'ring-emerald-400/40', dot: 'bg-emerald-400', bar: 'bg-emerald-400', hex: '#34d399' };
  if (t >= 60) return { text: 'text-amber-300', ring: 'ring-amber-400/40', dot: 'bg-amber-400', bar: 'bg-amber-400', hex: '#fbbf24' };
  return { text: 'text-rose-300', ring: 'ring-rose-400/40', dot: 'bg-rose-400', bar: 'bg-rose-400', hex: '#fb7185' };
}

export default function EmbedBadge() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const style = typeof window !== 'undefined'
    ? (new URLSearchParams(window.location.search).get('style') || 'full')
    : 'full';

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
  const href = `${origin}/verify/${id}`;

  if (style === 'pill') {
    return (
      <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-[#0B0F16] px-2.5 py-1 text-[11px] text-white hover:border-white/30 transition-colors" style={{ textDecoration: 'none' }}>
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: tone.hex }} />
        <span className="font-semibold tabular-nums">{trust}</span>
        <span className="text-slate-500">·</span>
        <ShieldCheck className="h-3 w-3 text-emerald-400" />
        <span className="text-slate-400">AETHER</span>
      </a>
    );
  }

  if (style === 'score') {
    return (
      <a href={href} target="_blank" rel="noreferrer" className="block rounded-2xl border border-white/10 bg-[#0B0F16] p-3 text-center hover:border-white/20 transition-colors" style={{ width: 120, textDecoration: 'none' }}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin mx-auto text-slate-500" />
          : err ? <ShieldAlert className="h-4 w-4 mx-auto text-rose-300" />
          : <div className={`text-3xl font-semibold tabular-nums leading-none ${tone.text}`}>{trust}</div>}
        <div className="text-[8px] uppercase tracking-[0.14em] text-slate-500 mt-1">AETHER</div>
      </a>
    );
  }

  const compact = style === 'compact';

  return (
    <div className="bg-[#070A0F] p-3" style={{ width: compact ? 220 : 320 }}>
      <a href={href} target="_blank" rel="noreferrer" className="block w-full rounded-2xl border border-white/10 bg-[#0B0F16] p-4 hover:border-white/20 transition-colors ring-1 ring-white/5">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="relative">
            <div className="absolute inset-0 blur-md bg-emerald-400/40 rounded-lg" />
            <div className="relative h-7 w-7 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center">
              <ShieldCheck className="h-3.5 w-3.5 text-[#070A0F]" strokeWidth={2.5} />
            </div>
          </div>
          <div className="leading-tight">
            <div className="font-heading text-[13px] font-semibold text-white">Verified by AETHER</div>
            <div className="text-[9px] uppercase tracking-[0.16em] text-slate-500">Epistemic receipt · SF2X</div>
          </div>
        </div>

        {loading && <div className="flex items-center justify-center py-5 text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /></div>}
        {!loading && err && <div className="flex items-center gap-2 text-xs text-rose-300 py-3"><ShieldAlert className="h-4 w-4" /> {err}</div>}

        {!loading && data && (
          <>
            <div className="flex items-end justify-between mb-2.5">
              <div>
                <div className={`text-3xl font-semibold tabular-nums leading-none ${tone.text}`}>{trust}</div>
                <div className="text-[9px] uppercase tracking-[0.16em] text-slate-500 mt-1">Trust / 100</div>
              </div>
              <span className={`inline-flex items-center gap-1 text-[9px] px-2 py-0.5 rounded-full ring-1 ${tone.ring} ${tone.text}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
                {verified ? 'Seal intact' : 'Unverified'}
              </span>
            </div>

            <div className="h-1.5 rounded-full bg-white/5 overflow-hidden mb-3">
              <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${Math.max(2, Math.min(100, trust))}%` }} />
            </div>

            {!compact && (
              <div className="grid grid-cols-3 gap-1.5 text-center">
                <Metric label="Warrant" value={data.warrant?.validity_status || '—'} />
                <Metric label="Confidence" value={data.warrant ? `${Math.round((data.warrant.confidence_score || 0) * 100)}%` : '—'} />
                <Metric label="Sources" value={`${data.warrant?.sources_count ?? 0}`} />
              </div>
            )}
          </>
        )}

        <div className="mt-3 pt-2.5 border-t border-white/5 flex items-center justify-between text-[10px] text-slate-500">
          <span className="font-mono">v{data?.version ?? '—'}</span>
          <span className="inline-flex items-center gap-1 text-emerald-300/80">View proof <ExternalLink className="h-3 w-3" /></span>
        </div>
      </a>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="rounded-lg bg-white/[0.03] border border-white/5 px-1.5 py-1">
      <div className="text-[8px] uppercase tracking-wider text-slate-600 truncate">{label}</div>
      <div className="text-[11px] text-slate-200 mt-0.5 truncate capitalize">{value}</div>
    </div>
  );
}