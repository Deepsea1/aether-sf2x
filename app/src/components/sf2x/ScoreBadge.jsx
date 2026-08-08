import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { computeTrustworthyRate } from '@/lib/sf2x';

// Compact trust-score badge shown next to the Aether logo. Fetches the same
// mean-trust metric as the EpistemicCompass but rendered as a small inline
// number so the score is visible at a glance next to the brand.
export default function ScoreBadge() {
  const [score, setScore] = useState(null);

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
        if (!scored.length) { setScore(null); return; }
        const avg = Math.round(scored.reduce((s, x) => s + x.trust, 0) / scored.length);
        setScore(avg);
      })
      .catch(() => { if (alive) setScore(null); });
    return () => { alive = false; };
  }, []);

  if (score == null) return null;

  return (
    <span className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-base font-bold tabular-nums text-emerald-300 bg-emerald-400/10 ring-1 ring-emerald-400/20">
      {score}
    </span>
  );
}