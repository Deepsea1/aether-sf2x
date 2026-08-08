import React from 'react';
import { motion } from 'framer-motion';
import { Gauge } from 'lucide-react';
import { METRIC_DEFS, computeTrustworthyRate, metricDisplay } from '@/lib/sf2x';

function clamp01(v) {
  return Math.max(0, Math.min(1, Number(v) || 0));
}

function TrustGauge({ value }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const offset = c - (value / 100) * c;
  const color = value >= 75 ? '#34D399' : value >= 50 ? '#FBBF24' : '#FB7185';
  return (
    <div className="relative h-[88px] w-[88px] shrink-0">
      <svg className="h-full w-full -rotate-90" viewBox="0 0 80 80">
        <circle cx="40" cy="40" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
        <motion.circle
          cx="40" cy="40" r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-semibold text-white">{value}</span>
        <span className="text-[9px] uppercase tracking-wider text-slate-500">trust</span>
      </div>
    </div>
  );
}

export default function MetricsGrid({ metrics, warrant }) {
  const trust = computeTrustworthyRate(metrics, warrant);
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5 sm:p-6"
    >
      <div className="flex items-center gap-2 mb-4">
        <Gauge className="h-4 w-4 text-teal-400" />
        <h3 className="text-sm font-medium text-slate-200">Epistemic Metrics</h3>
      </div>

      <div className="flex items-center gap-5 mb-5">
        <TrustGauge value={trust} />
        <div>
          <div className="text-[11px] uppercase tracking-wider text-slate-500">Trustworthy Answer Rate</div>
          <div className="text-2xl font-semibold text-white">{trust}<span className="text-sm text-slate-500">/100</span></div>
          <p className="text-[11px] text-slate-500 mt-0.5 max-w-[220px]">Composite of calibration, correction economy, drift, and warrant validity.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {METRIC_DEFS.map((def) => {
          const val = metrics?.[def.key];
          const ratio = def.unit === 'sec'
            ? Math.max(0, 1 - Math.min((Number(val) || 0) / 300, 1))
            : def.lowerBetter ? 1 - clamp01(val) : clamp01(val);
          const barColor = ratio >= 0.66 ? 'bg-emerald-400' : ratio >= 0.33 ? 'bg-amber-400' : 'bg-rose-400';
          return (
            <div key={def.key} className="rounded-lg bg-white/[0.03] border border-white/5 p-2.5">
              <div className="flex items-baseline justify-between">
                <span className="text-[10px] font-mono text-slate-500">{def.abbr}</span>
                <span className="text-sm font-medium text-slate-200">{metricDisplay(val, def)}</span>
              </div>
              <div className="mt-1.5 h-1 rounded-full bg-white/5 overflow-hidden">
                <div className={`h-full ${barColor}`} style={{ width: `${Math.round(ratio * 100)}%` }} />
              </div>
              <div className="mt-1 text-[9px] text-slate-600 leading-tight" title={def.desc}>{def.label}</div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}