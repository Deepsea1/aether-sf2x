import React from 'react';
import { motion } from 'framer-motion';
import { MessageSquare, Swords, Shield, Gavel, CheckCircle2, AlertTriangle, Ban, FileText } from 'lucide-react';
import { CONSENSUS_STYLES } from '@/lib/sf2xCollective';

// Visual stage timeline: Prompt -> Proposer -> Critic -> Verifier -> Verdict
export default function DebateTimeline({ inquiry, debate }) {
  if (!debate || !inquiry) return null;
  const cs = CONSENSUS_STYLES[debate.consensus] || CONSENSUS_STYLES.contested;
  const VerdictIcon = debate.consensus === 'agreed' ? CheckCircle2 : debate.consensus === 'rejected' ? Ban : AlertTriangle;

  const stages = [
    {
      key: 'prompt',
      icon: MessageSquare,
      tone: 'text-slate-300',
      dot: 'bg-slate-400',
      ring: 'ring-white/10',
      label: 'Inquiry',
      body: (
        <p className="text-xs text-slate-300 leading-relaxed">{inquiry.prompt}</p>
      ),
    },
    {
      key: 'proposer',
      icon: Swords,
      tone: 'text-sky-300',
      dot: 'bg-sky-400',
      ring: 'ring-sky-400/30',
      label: 'Proposer',
      body: (
        <div>
          <p className="text-xs text-slate-200 mb-1">{debate.proposer?.stance}</p>
          <p className="text-[11px] text-slate-500 leading-relaxed">{debate.proposer?.reasoning}</p>
        </div>
      ),
    },
    {
      key: 'critic',
      icon: Shield,
      tone: 'text-amber-300',
      dot: 'bg-amber-400',
      ring: 'ring-amber-400/30',
      label: 'Critic',
      body: (
        <div>
          <ul className="space-y-1 mb-1">
            {(debate.critic?.objections || []).map((o, i) => (
              <li key={i} className="text-[11px] text-slate-300 flex gap-1.5">
                <span className="text-amber-400/70 font-mono shrink-0">›</span>{o}
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-slate-500 leading-relaxed">{debate.critic?.risks}</p>
        </div>
      ),
    },
    {
      key: 'verifier',
      icon: Gavel,
      tone: 'text-emerald-300',
      dot: 'bg-emerald-400',
      ring: 'ring-emerald-400/30',
      label: 'Verifier',
      body: (
        <div>
          <p className="text-xs text-slate-200 mb-1">{debate.verifier?.verdict}</p>
          <div className="text-[11px] text-slate-500 mb-1">confidence {Math.round((debate.verifier_confidence ?? debate.verifier?.confidence ?? 0) * 100)}%</div>
          {(debate.verifier?.corrections || []).length > 0 && (
            <ul className="space-y-0.5">
              {(debate.verifier?.corrections || []).map((c, i) => (
                <li key={i} className="text-[11px] text-slate-400 flex gap-1.5">
                  <span className="text-emerald-400/70 shrink-0">✓</span>{c}
                </li>
              ))}
            </ul>
          )}
        </div>
      ),
    },
    {
      key: 'verdict',
      icon: VerdictIcon,
      tone: cs.text,
      dot: debate.consensus === 'agreed' ? 'bg-emerald-400' : debate.consensus === 'rejected' ? 'bg-rose-400' : 'bg-amber-400',
      ring: cs.ring,
      label: 'Verdict',
      body: (
        <div>
          <span className={`text-[11px] px-2 py-1 rounded-full ring-1 ${cs.bg} ${cs.ring} ${cs.text}`}>{cs.label}</span>
          {debate.minority_report && (
            <div className="mt-2 flex items-start gap-2">
              <FileText className="h-3 w-3 text-slate-500 mt-0.5 shrink-0" />
              <p className="text-[11px] text-slate-500 leading-relaxed">{debate.minority_report}</p>
            </div>
          )}
        </div>
      ),
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5"
    >
      <div className="flex items-center gap-2 mb-4">
        <Gavel className="h-4 w-4 text-emerald-400" />
        <h3 className="text-sm font-medium text-slate-200">Evolution Timeline</h3>
        <span className="text-[11px] text-slate-500">— prompt through tribunal to verdict</span>
      </div>

      <ol className="relative">
        {stages.map((s, i) => {
          const Icon = s.icon;
          const last = i === stages.length - 1;
          return (
            <li key={s.key} className="relative pl-9 pb-5 last:pb-0">
              {!last && <span className="absolute left-[15px] top-7 bottom-0 w-px bg-white/10" />}
              <span className={`absolute left-2 top-1.5 h-3 w-3 rounded-full ${s.dot} ring-2 ${s.ring}`} />
              <div className="flex items-center gap-1.5 mb-1.5">
                <Icon className={`h-3.5 w-3.5 ${s.tone}`} />
                <span className={`text-[10px] uppercase tracking-[0.18em] ${s.tone}`}>{s.label}</span>
                <span className="text-[10px] text-slate-600 font-mono">· stage {i + 1}</span>
              </div>
              <div className="rounded-lg bg-white/[0.03] border border-white/5 p-3">{s.body}</div>
            </li>
          );
        })}
      </ol>
    </motion.div>
  );
}