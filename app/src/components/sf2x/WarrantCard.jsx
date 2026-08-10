import React from 'react';
import { motion } from 'framer-motion';
import { ScrollText, Link2, ShieldCheck, Clock, Hash } from 'lucide-react';
import { VALIDITY_STYLES, timeUntilExpiry } from '@/lib/sf2x';
import RatingKey from '@/components/sf2x/RatingKey';

export default function WarrantCard({ warrant }) {
  if (!warrant) return null;
  const v = VALIDITY_STYLES[warrant.validity_status] || VALIDITY_STYLES.valid;
  const exp = timeUntilExpiry(warrant.expiry_date);
  const conf = Math.round((warrant.confidence_score ?? 0) * 100);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 }}
      className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5 sm:p-6"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ScrollText className="h-4 w-4 text-emerald-400" />
          <h3 className="text-sm font-medium text-slate-200">Decision Validity Warrant</h3>
        </div>
        <div className="flex items-center gap-2">
          <RatingKey label="" className="text-slate-500 hover:text-emerald-300" />
          <span className={`flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-full bg-white/[0.04] ring-1 ${v.ring} ${v.text}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${v.dot}`} /> {v.label}
          </span>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-1.5">Premises</div>
          <ul className="space-y-1.5">
            {(warrant.premises || []).map((p, i) => (
              <li key={i} className="flex gap-2 text-xs text-slate-300">
                <span className="text-emerald-400/60 mt-0.5 font-mono">P{i + 1}</span>
                <span className="leading-relaxed">{p}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-lg bg-emerald-400/[0.04] border border-emerald-400/10 p-3">
          <div className="text-[11px] uppercase tracking-wider text-emerald-400/70 mb-1">Conclusion</div>
          <p className="text-sm text-slate-200 leading-relaxed">{warrant.conclusion}</p>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-1">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-3.5 w-3.5 text-slate-500" />
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-600">Confidence</div>
              <div className="text-sm text-slate-200">{conf}%</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 text-slate-500" />
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-600">Revalidate in</div>
              <div className={`text-sm ${exp.expired ? 'text-rose-300' : 'text-slate-200'}`}>{exp.label}</div>
            </div>
          </div>
        </div>

        {(warrant.sources || []).length > 0 && (
          <div>
            <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1">
              <Link2 className="h-3 w-3" /> Sources
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(warrant.sources || []).map((s, i) => (
                <span key={i} className="text-[11px] px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/5 text-slate-400">{s}</span>
              ))}
            </div>
            {warrant.corroboration && warrant.corroboration.count > 0 && (
              <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-emerald-300 bg-emerald-400/10 ring-1 ring-emerald-400/20 px-2 py-1 rounded-lg">
                <Link2 className="h-3 w-3" /> Corroborated by {warrant.corroboration.count} source{warrant.corroboration.count === 1 ? '' : 's'} cited across {warrant.corroboration.total_models} independent AIs
              </div>
            )}
          </div>
        )}

        {warrant.signed_hash && (
          <div className="flex items-center gap-1.5 pt-1 text-[10px] text-slate-600 font-mono break-all">
            <Hash className="h-3 w-3 shrink-0" /> {warrant.signed_hash}
          </div>
        )}
      </div>
    </motion.div>
  );
}