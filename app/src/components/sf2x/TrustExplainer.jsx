import React from 'react';
import { motion } from 'framer-motion';
import { Link2, AlertTriangle, History, ScrollText } from 'lucide-react';
import { Link } from 'react-router-dom';
import { computeTrustworthyRate } from '@/lib/sf2x';
import { SEVERITY_STYLES } from '@/lib/sf2xGovernance';
import { computeTrustDimensions } from '@/lib/sf2xTrust';

function DimBar({ label, value, reason }) {
  const color = value >= 66 ? 'bg-emerald-400' : value >= 33 ? 'bg-amber-400' : 'bg-rose-400';
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] text-slate-300">{label}</span>
        <span className="text-[11px] text-slate-500">{value}/100</span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
        <motion.div initial={{ width: 0 }} animate={{ width: `${value}%` }} transition={{ duration: 0.6 }} className={`h-full ${color}`} />
      </div>
      <p className="text-[10px] text-slate-600 mt-0.5">{reason}</p>
    </div>
  );
}

export default function TrustExplainer({ version, warrant, review, correction }) {
  const trust = computeTrustworthyRate(version?.metrics, warrant);
  const dims = computeTrustDimensions(version?.metrics, warrant, review);
  const premises = warrant?.premises || [];
  const sources = warrant?.sources || [];
  const risks = version?.cognitive_state?.self_model?.uncertainty_factors || [];

  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5 overflow-hidden">
      <div className="flex items-center gap-2 mb-4">
        <ScrollText className="h-4 w-4 text-teal-400" />
        <h3 className="text-sm font-medium text-slate-200">Why this score</h3>
        <span className="text-[11px] text-slate-500">— {trust}/100</span>
      </div>

      <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3 mb-4">
        {dims.map((d) => <DimBar key={d.key} label={d.label} value={d.value} reason={d.reason} />)}
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="rounded-lg bg-white/[0.02] border border-white/5 p-3">
          <div className="text-[10px] uppercase tracking-wider text-emerald-400/70 mb-2">Supporting evidence</div>
          {premises.length === 0 ? (
            <p className="text-[11px] text-slate-600">No premises recorded.</p>
          ) : (
            <ul className="space-y-1 mb-2">
              {premises.slice(0, 4).map((p, i) => (
                <li key={i} className="text-[11px] text-slate-300 flex gap-1.5"><span className="text-emerald-400/60 font-mono">P{i + 1}</span>{p}</li>
              ))}
            </ul>
          )}
          {sources.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {sources.slice(0, 6).map((s, i) => (
                <span key={i} className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-slate-400"><Link2 className="h-2.5 w-2.5" />{s}</span>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-lg bg-white/[0.02] border border-white/5 p-3">
          <div className="text-[10px] uppercase tracking-wider text-rose-400/70 mb-2">Top risks</div>
          {risks.length === 0 ? (
            <p className="text-[11px] text-slate-600">No uncertainty factors flagged.</p>
          ) : (
            <ul className="space-y-1">
              {risks.slice(0, 4).map((rsk, i) => (
                <li key={i} className="text-[11px] text-slate-300 flex gap-1.5"><AlertTriangle className="h-3 w-3 text-rose-400/60 shrink-0 mt-0.5" />{rsk}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="rounded-lg bg-white/[0.02] border border-white/5 p-3 mt-3">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">
          <History className="h-3 w-3" /> Change history
        </div>
        {correction ? (
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="text-slate-400">v{correction.from_version} → v{correction.to_version}</span>
            <span className={correction.trust_delta >= 0 ? 'text-emerald-300' : 'text-rose-300'}>trust {correction.trust_delta >= 0 ? '+' : ''}{correction.trust_delta}</span>
            <span className={`px-1.5 py-0.5 rounded ${SEVERITY_STYLES[correction.severity]?.bg || 'bg-white/5'} ${SEVERITY_STYLES[correction.severity]?.text || 'text-slate-400'}`}>{correction.severity}</span>
            <span className="text-slate-600">drift {Math.round((correction.drift_score || 0) * 100)}%</span>
          </div>
        ) : (
          <p className="text-[11px] text-slate-600">First version — no prior change recorded.</p>
        )}
      </div>

      <div className="flex items-center gap-3 mt-4">
        <Link to="/governance" className="text-[11px] text-emerald-300 hover:text-emerald-200">Open audit trail →</Link>
        <Link to="/governance" className="text-[11px] text-sky-300 hover:text-sky-200">Open fixes →</Link>
      </div>
    </motion.div>
  );
}