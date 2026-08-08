import React from 'react';
import { motion } from 'framer-motion';
import { Swords, Shield, Gavel, FileText } from 'lucide-react';
import { CONSENSUS_STYLES } from '@/lib/sf2xCollective';

export default function DebatePanel({ debate }) {
  if (!debate) return null;
  const cs = CONSENSUS_STYLES[debate.consensus] || CONSENSUS_STYLES.contested;
  const roles = [
    { key: 'proposer', icon: Swords, label: 'Proposer', tone: 'text-sky-300', body: debate.proposer },
    { key: 'critic', icon: Shield, label: 'Critic', tone: 'text-amber-300', body: debate.critic },
    { key: 'verifier', icon: Gavel, label: 'Verifier', tone: 'text-emerald-300', body: debate.verifier },
  ];
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-slate-200">Collective Cognition Tribunal</h3>
        <span className={`text-[11px] px-2 py-1 rounded-full ring-1 ${cs.bg} ${cs.ring} ${cs.text}`}>{cs.label}</span>
      </div>
      <div className="grid sm:grid-cols-3 gap-3">
        {roles.map((r) => {
          const Icon = r.icon;
          const b = r.body || {};
          return (
            <div key={r.key} className="rounded-lg bg-white/[0.03] border border-white/5 p-3">
              <div className={`flex items-center gap-1.5 mb-2 ${r.tone}`}>
                <Icon className="h-3.5 w-3.5" />
                <span className="text-[11px] uppercase tracking-wider">{r.label}</span>
              </div>
              {r.key === 'proposer' && (
                <>
                  <p className="text-xs text-slate-200 mb-1">{b.stance}</p>
                  <p className="text-[11px] text-slate-500">{b.reasoning}</p>
                </>
              )}
              {r.key === 'critic' && (
                <>
                  <ul className="space-y-1 mb-1">
                    {(b.objections || []).map((o, i) => (
                      <li key={i} className="text-[11px] text-slate-300 flex gap-1"><span className="text-amber-400/60">•</span>{o}</li>
                    ))}
                  </ul>
                  <p className="text-[11px] text-slate-500">{b.risks}</p>
                </>
              )}
              {r.key === 'verifier' && (
                <>
                  <p className="text-xs text-slate-200 mb-1">{b.verdict}</p>
                  <div className="text-[11px] text-slate-500 mb-1">confidence {Math.round((b.confidence || 0) * 100)}%</div>
                  {(b.corrections || []).length > 0 && (
                    <ul className="space-y-0.5">
                      {(b.corrections || []).map((c, i) => (
                        <li key={i} className="text-[11px] text-slate-400 flex gap-1"><span className="text-emerald-400/60">✓</span>{c}</li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
      {debate.minority_report && (
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-white/[0.02] border border-white/5 p-3">
          <FileText className="h-3.5 w-3.5 text-slate-500 mt-0.5 shrink-0" />
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">Minority Report</div>
            <p className="text-[11px] text-slate-400">{debate.minority_report}</p>
          </div>
        </div>
      )}
    </motion.div>
  );
}