import React from 'react';
import { motion } from 'framer-motion';
import { Crown, AlertCircle, CheckCircle2 } from 'lucide-react';

function trustColor(t) {
  if (t >= 80) return 'text-emerald-300';
  if (t >= 60) return 'text-amber-300';
  return 'text-rose-300';
}
function trustRing(t) {
  if (t >= 80) return 'border-emerald-400/40';
  if (t >= 60) return 'border-amber-400/40';
  return 'border-rose-400/40';
}

export default function RankedAnswers({ results }) {
  if (!results?.length) return null;
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-xs uppercase tracking-[0.16em] text-slate-500">Model comparison · ranked by trust</h3>
      </div>
      <div className="grid sm:grid-cols-2 gap-3 items-start">
        {results.map((r, i) => (
          <motion.div
            key={r.model}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            className={`rounded-xl border bg-[#0B0F16] p-4 ${i === 0 ? `${trustRing(r.trust)} ring-1` : 'border-white/10'}`}
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-1.5 min-w-0">
                {i === 0 && <Crown className="h-3.5 w-3.5 text-amber-400 shrink-0" />}
                <span className="text-sm text-slate-200 font-medium truncate">{r.label}</span>
                <span className="text-[10px] text-slate-600 truncate">{r.tag}</span>
              </div>
              {r.error ? (
                <AlertCircle className="h-3.5 w-3.5 text-rose-400 shrink-0" />
              ) : (
                <span className={`text-lg font-semibold ${trustColor(r.trust)}`}>{Math.round(r.trust)}</span>
              )}
            </div>
            {r.error ? (
              <p className="text-xs text-rose-300/80">{r.error}</p>
            ) : (
              <>
                <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap line-clamp-6">{r.answer}</p>
                <div className="mt-3 flex items-center gap-1.5 text-[10px] text-slate-500">
                  {r.warrant?.validity_status === 'valid' && <CheckCircle2 className="h-3 w-3 text-emerald-400" />}
                  <span>
                    {(r.warrant?.premises || []).length} premises · {(r.warrant?.sources || []).length} sources · conf{' '}
                    {Math.round((r.warrant?.confidence_score || 0) * 100)}%
                  </span>
                </div>
              </>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}