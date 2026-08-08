import React, { useEffect, useState } from 'react';
import { TrendingUp, AlertOctagon, Gauge, Calendar, Cpu, Ban } from 'lucide-react';
import { base44 } from '@/api/base44Client';

// Gate 4 — published calibration. Reads the latest CalibrationReport and
// renders the Brier score, per-confidence-bucket accuracy, catch rates, corpus
// size, last-run date, model provenance, and the regression flag. A bucket with
// accuracy < 0.65 is flagged "suppressed" — we show the verdict band only, never
// a numeric confidence the eval set has falsified.

export default function CalibrationCard() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = await base44.entities.CalibrationReport.list('-created_date', 1);
        if (alive) setReport((list || [])[0] || null);
      } catch (e) {
        if (alive) setErr(String(e?.message || e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  if (loading) {
    return <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5 text-sm text-slate-500">Loading calibration…</div>;
  }
  if (err || !report) {
    return (
      <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5 text-sm text-slate-500">
        {err ? `Calibration unavailable: ${err}` : 'No calibration run published yet. Gate 4 publishes the curve on the first run.'}
      </div>
    );
  }

  const cr = report.catch_rates || {};
  const buckets = Array.isArray(report.buckets) ? report.buckets : [];
  const maxAcc = Math.max(0.1, ...buckets.map((b) => b.accuracy || 0));
  const provenance = Array.isArray(report.model_provenance) ? report.model_provenance : [];

  return (
    <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.03] p-5">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-emerald-300/80">
          <Gauge className="h-3.5 w-3.5" /> Calibration · Gate 4
        </div>
        {report.regression && (
          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-rose-300 bg-rose-500/10 ring-1 ring-rose-400/30 px-2 py-0.5 rounded-full">
            <AlertOctagon className="h-3 w-3" /> regression · blocks release
          </span>
        )}
        <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-slate-500">
          <Calendar className="h-3 w-3" />
          {report.last_run_date ? new Date(report.last_run_date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <Stat label="Corpus size" value={report.corpus_size ?? '—'} hint={`versioned benchmark · v${(report.corpus_version || '').replace('v', '')}`} />
        <Stat label="Brier score" value={typeof report.brier === 'number' ? report.brier.toFixed(3) : '—'} hint="lower is better" />
        <Stat label="FABRICATED catch" value={pct(cr.fabricated?.rate)} hint={`${cr.fabricated?.caught ?? 0}/${cr.fabricated?.n ?? 0}`} tone="rose" />
        <Stat label="TRUE pass" value={pct(cr.true?.rate)} hint={`${cr.true?.passed ?? 0}/${cr.true?.n ?? 0}`} tone="emerald" />
      </div>

      <div className="mb-4">
        <div className="text-[11px] uppercase tracking-[0.14em] text-slate-400 mb-2">Calibration by confidence bucket</div>
        {buckets.length === 0 ? (
          <div className="text-[12px] text-slate-500">No bucket data.</div>
        ) : (
          <div className="space-y-2">
            {buckets.map((b) => (
              <div key={b.range} className="flex items-center gap-3">
                <div className="w-16 text-[11px] font-mono text-slate-400 shrink-0">{b.range}</div>
                <div className="flex-1 h-2.5 rounded-full bg-white/5 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${b.suppressed ? 'bg-rose-400/60' : 'bg-emerald-400/70'}`}
                    style={{ width: `${(b.accuracy / maxAcc) * 100}%` }}
                  />
                </div>
                <div className={`w-16 text-[11px] font-mono text-right ${b.suppressed ? 'text-rose-300' : 'text-slate-300'}`}>
                  {b.n > 0 ? `${(b.accuracy * 100).toFixed(0)}%` : '—'}
                </div>
                {b.suppressed && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-rose-300/80" title="Bucket accuracy < 65% — numeric confidence suppressed, verdict band shown only.">
                    <Ban className="h-3 w-3" /> suppressed
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="text-[11px] text-slate-500 mt-2">
          A bucket is the empirical accuracy of trust scores that landed in that confidence range. A well-calibrated bucket shows accuracy ≈ its range midpoint. Suppressed buckets (acc &lt; 65%) hide their number — we show the verdict band only, never a confidence the eval set has falsified.
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.14em] text-slate-400 mb-1.5">Catch rates</div>
          <ul className="text-[12px] text-slate-400 space-y-1">
            <li>FABRICATED: <span className="text-slate-200">{pct(cr.fabricated?.rate)} ({cr.fabricated?.caught ?? 0}/{cr.fabricated?.n ?? 0})</span></li>
            <li>CORRUPTED: <span className="text-slate-200">{pct(cr.corrupted?.rate)} ({cr.corrupted?.caught ?? 0}/{cr.corrupted?.n ?? 0})</span></li>
            <li>TRUE: <span className="text-slate-200">{pct(cr.true?.rate)} ({cr.true?.passed ?? 0}/{cr.true?.n ?? 0})</span></li>
            <li>Thin-coverage abstention: <span className="text-slate-200">{pct(cr.thin_coverage?.rate)} ({cr.thin_coverage?.abstained ?? 0}/{cr.thin_coverage?.n ?? 0})</span></li>
          </ul>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-[0.14em] text-slate-400 mb-1.5 inline-flex items-center gap-1"><Cpu className="h-3 w-3" /> Model provenance</div>
          <ul className="text-[12px] text-slate-400 space-y-1">
            {provenance.length ? provenance.map((p, i) => (
              <li key={i}><span className="text-slate-200">{p.role}</span> · {p.vendor} · <span className="font-mono text-[11px]">{p.model}</span></li>
            )) : <li className="text-slate-500">—</li>}
          </ul>
        </div>
      </div>

      <div className="text-[11px] text-slate-500 mt-4 leading-relaxed flex items-start gap-1.5">
        <TrendingUp className="h-3 w-3 mt-0.5 shrink-0" />
        {report.notes || `Calibration against corpus ${report.corpus_version} (n=${report.corpus_size}). Grounded=${!!report.grounded}, cross-firm=${!!report.cross_firm}. Ground truth in v2 is AI-authored draft, pending human lock — the curves are real numbers against a real corpus, but the corpus lock status is disclosed.`}
      </div>
    </div>
  );
}

function pct(r) { return typeof r === 'number' ? `${(r * 100).toFixed(0)}%` : '—'; }

function Stat({ label, value, hint, tone = 'slate' }) {
  const c = tone === 'rose' ? 'text-rose-300' : tone === 'emerald' ? 'text-emerald-300' : 'text-white';
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`font-mono text-lg ${c} leading-tight mt-0.5`}>{value}</div>
      <div className="text-[10px] text-slate-500 mt-0.5">{hint}</div>
    </div>
  );
}