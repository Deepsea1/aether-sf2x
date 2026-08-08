import React from 'react';
import { motion } from 'framer-motion';
import { Brain, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { SEVERITY_STYLES } from '@/lib/sf2xGovernance';
import RatingKey from '@/components/sf2x/RatingKey';

export default function AnswerCard({ version, correction }) {
  const cs = version.cognitive_state || {};
  const self = cs.self_model || {};
  const confidence = Math.round((self.confidence ?? 0) * 100);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5 sm:p-6"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-indigo-400" />
          <h3 className="text-sm font-medium text-slate-200">Warranted Answer</h3>
          <span className="text-[11px] text-slate-600">v{version.version}</span>
          {cs.model && cs.model !== 'automatic' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-400/10 text-indigo-300">{cs.model.replace(/_/g, ' ')}</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <RatingKey label="How to read this" />
          <span className="text-[11px] text-slate-500 flex items-center gap-1">
            <Clock className="h-3 w-3" /> {formatDistanceToNow(new Date(version.created_date), { addSuffix: true })}
          </span>
        </div>
      </div>

      <p className="text-sm leading-relaxed text-slate-300 whitespace-pre-wrap">{version.answer_text}</p>

      {cs.reasoning_summary && (
        <div className="mt-4 rounded-lg bg-white/[0.03] border border-white/5 p-3">
          <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-1">Reasoning Trace</div>
          <p className="text-xs text-slate-400 leading-relaxed">{cs.reasoning_summary}</p>
        </div>
      )}

      {(cs.working_memory || []).length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {cs.working_memory.slice(0, 6).map((m, i) => (
            <span key={i} className="text-[11px] px-2 py-1 rounded-md bg-white/[0.04] border border-white/5 text-slate-400">
              {m}
            </span>
          ))}
        </div>
      )}

      <div className="mt-4 flex items-center gap-3">
        <div className="flex-1">
          <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
            <span>Self-model confidence</span>
            <span className="text-slate-300">{confidence}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-indigo-400 to-emerald-400" style={{ width: `${confidence}%` }} />
          </div>
        </div>
        {(self.uncertainty_factors || []).length > 0 && (
          <div className="text-[11px] text-amber-300/80 max-w-[45%]">
            ⚠ {(self.uncertainty_factors || []).join(' · ')}
          </div>
        )}
      </div>

      {correction && (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] pt-3 border-t border-white/5">
          <span className={`px-2 py-0.5 rounded ${SEVERITY_STYLES[correction.severity]?.bg || 'bg-white/5'} ${SEVERITY_STYLES[correction.severity]?.text || 'text-slate-300'}`}>
            {SEVERITY_STYLES[correction.severity]?.label || correction.severity} correction
          </span>
          <span className="text-slate-500">
            v{correction.from_version} → v{correction.to_version} · MTTC {correction.time_to_correction}s · trust {correction.trust_delta >= 0 ? '+' : ''}{correction.trust_delta}
          </span>
        </div>
      )}
    </motion.div>
  );
}