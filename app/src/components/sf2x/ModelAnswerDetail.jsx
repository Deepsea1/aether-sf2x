import React from 'react';
import { Clock, FileText, Link2 } from 'lucide-react';

function trustColor(t) {
  if (t >= 80) return 'text-emerald-300';
  if (t >= 60) return 'text-amber-300';
  return 'text-rose-300';
}
function corrColor(c) {
  if (c == null) return 'text-slate-500';
  if (c >= 0.8) return 'text-emerald-300';
  if (c >= 0.5) return 'text-amber-300';
  return 'text-rose-300';
}

export default function ModelAnswerDetail({ run }) {
  if (!run) return <p className="text-xs text-slate-600">No answer recorded for this model.</p>;
  const answer = run.answer_text || run.answer || '';
  const trust = run.trust_score ?? run.trust ?? 0;
  const correctness = run.correctness ?? null;
  const latency = run.latency_ms ?? null;
  const ws = run.warrant_summary || (run.warrant && {
    validity: run.warrant.validity_status,
    confidence: run.warrant.confidence_score,
    premises: (run.warrant.premises || []).length,
    sources: (run.warrant.sources || []).length,
  }) || {};
  const verifierNotes = run.verifier_notes || '';
  const valid = ws.validity === 'valid';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[11px]">
        <span className="text-slate-600">correctness <span className={corrColor(correctness)}>{correctness != null ? Math.round(correctness * 100) + '%' : '—'}</span></span>
        <span className="text-slate-600">trust <span className={trustColor(trust)}>{Math.round(trust)}</span></span>
        <span className="text-slate-600 inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {latency != null ? latency + 'ms' : '—'}</span>
        <span className="text-slate-600">warrant <span className={valid ? 'text-emerald-300' : 'text-amber-300'}>{ws.validity || '—'}</span></span>
        {ws.confidence != null && <span className="text-slate-600">confidence <span className="text-slate-300">{Math.round(ws.confidence * 100)}%</span></span>}
        <span className="text-slate-600 inline-flex items-center gap-1"><FileText className="h-3 w-3" /> {ws.premises ?? '—'} premises</span>
        <span className="text-slate-600 inline-flex items-center gap-1"><Link2 className="h-3 w-3" /> {ws.sources ?? '—'} sources</span>
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Answer</div>
        <div className="max-h-44 overflow-auto rounded-lg bg-black/30 border border-white/5 p-3">
          <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">{answer || '—'}</p>
        </div>
      </div>
      {verifierNotes && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Verifier notes</div>
          <p className="text-xs text-slate-400 italic">{verifierNotes}</p>
        </div>
      )}
    </div>
  );
}