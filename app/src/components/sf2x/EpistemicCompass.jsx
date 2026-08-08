import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, AlertTriangle, Activity } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { computeTrustworthyRate } from '@/lib/sf2x';
import { HoverCard, HoverCardTrigger, HoverCardContent } from '@/components/ui/hover-card';

const TONES = {
  emerald: { orb: 'bg-emerald-400', text: 'text-emerald-300' },
  amber: { orb: 'bg-amber-400', text: 'text-amber-300' },
  rose: { orb: 'bg-rose-400', text: 'text-rose-300' },
  slate: { orb: 'bg-slate-500', text: 'text-slate-400' },
};

export default function EpistemicCompass() {
  const [state, setState] = useState(null);

  useEffect(() => {
    let alive = true;
    Promise.all([
      base44.entities.AnswerVersion.list('-created_date', 30),
      base44.entities.Warrant.list('-created_date', 100),
    ])
      .then(([list, warrants]) => {
        if (!alive) return;
        const wMap = new Map(warrants.map((w) => [w.id, w]));
        const scored = list
          .map((v) => ({ v, trust: computeTrustworthyRate(v?.metrics, wMap.get(v?.warrant_id)) }))
          .filter((x) => x.v && x.v.metrics);
        const n = scored.length;
        if (!n) {
          setState({ avg: null, riskFrac: null, n: 0, label: 'No answers yet', tone: 'slate', Icon: Activity });
          return;
        }
        const avg = scored.reduce((s, x) => s + x.trust, 0) / n;
        const riskFrac = scored.filter((x) => x.trust < 50).length / n;
        let label, tone, Icon;
        if (avg >= 75 && riskFrac < 0.15) { label = 'High confidence · low risk'; tone = 'emerald'; Icon = ShieldCheck; }
        else if (avg >= 60) { label = 'Moderate confidence · monitor'; tone = 'amber'; Icon = Activity; }
        else { label = 'Low confidence · review needed'; tone = 'rose'; Icon = AlertTriangle; }
        setState({ avg: Math.round(avg), riskFrac: Math.round(riskFrac * 100), n, label, tone, Icon });
      })
      .catch(() => { if (alive) setState({ avg: null, riskFrac: null, n: 0, label: 'Engine online', tone: 'emerald', Icon: Activity }); });
    return () => { alive = false; };
  }, []);

  const tone = state?.tone || 'slate';
  const t = TONES[tone];
  const Icon = state?.Icon || Activity;

  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        {tone === 'rose' ? (
          <Link to="/governance" title="Open the governance review queue" className="hidden sm:flex items-center gap-2 text-xs text-rose-300 hover:text-rose-200 transition-colors">
            <span className="relative flex h-2 w-2">
              <span className={`absolute inline-flex h-full w-full rounded-full ${t.orb} opacity-60 animate-ping`} />
              <span className={`relative inline-flex h-2 w-2 rounded-full ${t.orb}`} />
            </span>
            <span className={`font-semibold tabular-nums ${t.text}`}>{state?.avg != null ? `${state.avg}/100` : '…'}</span>
          </Link>
        ) : (
          <button className="hidden sm:flex items-center gap-2 text-xs text-slate-400 hover:text-slate-200 transition-colors">
            <span className="relative flex h-2 w-2">
              <span className={`absolute inline-flex h-full w-full rounded-full ${t.orb} opacity-60 animate-ping`} />
              <span className={`relative inline-flex h-2 w-2 rounded-full ${t.orb}`} />
            </span>
            <span className={`font-semibold tabular-nums ${t.text}`}>{state?.avg != null ? `${state.avg}/100` : '…'}</span>
          </button>
        )}
      </HoverCardTrigger>
      <HoverCardContent className="w-64 bg-[#0B0F16] border-white/10 text-slate-200">
        <div className="flex items-center gap-2 mb-2">
          <Icon className={`h-4 w-4 ${t.text}`} />
          <span className="text-sm font-medium">Epistemic compass</span>
        </div>
        <p className="text-xs text-slate-400 mb-3">
          Aggregate state across the last {state?.n || 0} warranted answer{state?.n === 1 ? '' : 's'}.
        </p>
        <div className="space-y-1.5 text-xs">
          <div className="flex justify-between"><span className="text-slate-500">Mean trust score</span><span className={t.text}>{state?.avg != null ? `${state.avg}/100` : '—'}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">High-risk answers</span><span className={t.text}>{state?.riskFrac != null ? `${state.riskFrac}%` : '—'}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Sample</span><span className="text-slate-300">{state?.n || 0}</span></div>
        </div>
        {tone === 'rose' && (
          <p className="text-[11px] text-rose-300 pt-2 border-t border-white/5 mt-2">Click to open the review queue →</p>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}