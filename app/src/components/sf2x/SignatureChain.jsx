import React from 'react';
import { motion } from 'framer-motion';
import { Download, Link2 } from 'lucide-react';
import { buildProvenanceChain, SIG_STATE_STYLES, chainStatus, downloadProvenanceBundle } from '@/lib/sf2xProvenance';

export default function SignatureChain({ version, warrant, inquiry, review, audits }) {
  const steps = buildProvenanceChain(version, warrant, inquiry, review);
  const status = chainStatus(steps);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-sky-400" />
          <h3 className="text-sm font-medium text-slate-200">Signature Chain</h3>
          <span className={`text-[11px] ${status.text}`}>{status.label}</span>
        </div>
        <button
          onClick={() => downloadProvenanceBundle(version, warrant, inquiry, review, audits)}
          className="h-7 px-2 rounded-lg border border-white/10 text-slate-300 hover:bg-white/5 hover:text-white flex items-center gap-1 text-[11px]"
        >
          <Download className="h-3.5 w-3.5" /> Export signed bundle
        </button>
      </div>

      <div className="flex items-stretch gap-1 overflow-x-auto pb-2">
        {steps.map((s, i) => {
          const st = SIG_STATE_STYLES[s.status] || SIG_STATE_STYLES.unsigned;
          return (
            <div key={s.stage} className="flex items-center">
              <div className="w-[112px] shrink-0 rounded-lg bg-white/[0.02] border border-white/5 p-2.5">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className={`h-2 w-2 rounded-full ${st.dot}`} />
                  <span className="text-[10px] uppercase tracking-wider text-slate-500">Step {i + 1}</span>
                </div>
                <div className="text-[11px] text-slate-200 leading-tight mb-1">{s.label}</div>
                <div className={`text-[9px] ${st.text}`}>{st.label}</div>
                {s.hash && <div className="text-[9px] text-slate-600 font-mono mt-1 truncate" title={s.hash}>{s.hash}</div>}
              </div>
              {i < steps.length - 1 && <div className="w-3 h-px bg-white/10 mx-0.5 shrink-0" />}
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}