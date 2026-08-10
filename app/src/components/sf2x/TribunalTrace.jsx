import React from 'react';
import { motion } from 'framer-motion';
import { Crown, Swords, GitMerge, ShieldCheck, Link2 } from 'lucide-react';
import CompanyBadge from '@/components/sf2x/CompanyBadge';

// Visualizes the hardened 3-way tribunal behind an answer: the three independent
// candidates ranked by the cross-firm verifier (winner crowned), the verifier
// that merged them, the consensus, and how many sources were corroborated across
// the three AIs. Shown on the Console under the warranted answer.
export default function TribunalTrace({ tribunal, candidates = [] }) {
  if (!tribunal || tribunal.mode !== 'tribunal') return null;
  const ranked = [...candidates].sort((a, b) => (b.correctness ?? -1) - (a.correctness ?? -1) || (b.trust || 0) - (a.trust || 0));
  const corr = tribunal.corroboration || {};

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5">
      <div className="flex items-center gap-2 mb-1">
        <Swords className="h-4 w-4 text-emerald-300" />
        <h3 className="text-sm font-medium text-slate-200">Tribunal trace · hardened answer</h3>
        {tribunal.consensus && (
          <span className={`text-[10px] px-2 py-0.5 rounded-full ${tribunal.consensus === 'agreed' ? 'bg-emerald-400/10 text-emerald-300 ring-1 ring-emerald-400/30' : 'bg-amber-400/10 text-amber-300 ring-1 ring-amber-400/30'}`}>
            {tribunal.consensus}
          </span>
        )}
      </div>
      <p className="text-[11px] text-slate-500 mb-4">Three AIs answered independently, cross-examined each other, reconciled, then a cross-firm verifier synthesized one hardened answer. Every candidate below is logged to the benchmark.</p>

      <div className="grid sm:grid-cols-3 gap-3">
        {ranked.map((c, i) => (
          <motion.div key={c.id || c.model + i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className={`rounded-xl border bg-[#070A0F] p-3 ${c.is_winner ? 'border-emerald-400/40 ring-1 ring-emerald-400/20' : 'border-white/10'}`}>
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-1.5 min-w-0">
                {c.is_winner && <Crown className="h-3.5 w-3.5 text-amber-400 shrink-0" />}
                <span className="text-xs text-slate-200 font-medium truncate">{c.label}</span>
              </div>
              {c.company && <CompanyBadge company={c.company} showName={false} />}
            </div>
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-slate-500">verifier correct</span>
              <span className={c.is_winner ? 'text-emerald-300 font-medium' : 'text-slate-300'}>
                {c.correctness != null ? Math.round(c.correctness * 100) + '%' : '—'}
              </span>
            </div>
            <div className="flex items-center justify-between text-[10px] mt-1">
              <span className="text-slate-500">self trust</span>
              <span className="text-slate-400">{Math.round(c.trust || 0)}</span>
            </div>
            {c.error && <p className="text-[10px] text-rose-300/80 mt-1.5">{c.error}</p>}
          </motion.div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
        <Meta icon={GitMerge} label="Verifier" value={(tribunal.verifier || []).join(' + ') || '—'} />
        <Meta icon={ShieldCheck} label="Consensus" value={tribunal.consensus || '—'} />
        <Meta icon={Link2} label="Corroborated" value={corr.count != null ? `${corr.count}/${corr.total_models} models` : '—'} />
        <Meta icon={Link2} label="Sources" value={corr.total_sources != null ? `${corr.total_sources} cited` : '—'} />
      </div>

      {tribunal.merge_notes && (
        <div className="mt-3 pt-3 border-t border-white/5">
          <span className="text-[10px] uppercase tracking-wider text-slate-600">merge notes</span>
          <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">{tribunal.merge_notes}</p>
        </div>
      )}
    </div>
  );
}

function Meta({ icon: Icon, label, value }) {
  return (
    <div className="rounded-lg bg-white/[0.02] border border-white/5 px-2.5 py-2">
      <div className="flex items-center gap-1 text-slate-600 text-[10px]"><Icon className="h-3 w-3" /> {label}</div>
      <div className="text-slate-300 mt-0.5 truncate" title={String(value)}>{value}</div>
    </div>
  );
}