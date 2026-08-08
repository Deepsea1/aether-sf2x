import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { format } from 'date-fns';

const TREND_METRICS = [
  { key: 'confidence_entropy', abbr: 'CE', color: '#38BDF8', lowerBetter: true },
  { key: 'expected_calibration_error', abbr: 'ECE', color: '#A78BFA', lowerBetter: true },
  { key: 'uncorrected_confidence_rate', abbr: 'UCR', color: '#FB7185', lowerBetter: true },
  { key: 'false_refusal_rate', abbr: 'FRR', color: '#FBBF24', lowerBetter: true },
];

function build30Day(versions) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push({ ts: d.getTime(), label: format(d, 'MMM d'), trustSum: 0, trustN: 0, metricSums: {}, metricN: {} });
  }
  const map = new Map(days.map((d, i) => [d.ts, i]));
  versions.forEach((v) => {
    if (!v.created_date) return;
    const cd = new Date(v.created_date);
    cd.setHours(0, 0, 0, 0);
    const i = map.get(cd.getTime());
    if (i == null) return;
    const b = days[i];
    if (typeof v.trust === 'number') { b.trustSum += v.trust; b.trustN += 1; }
    TREND_METRICS.forEach((m) => {
      const val = Number(v.metrics?.[m.key]);
      if (!Number.isNaN(val)) {
        b.metricSums[m.key] = (b.metricSums[m.key] || 0) + val;
        b.metricN[m.key] = (b.metricN[m.key] || 0) + 1;
      }
    });
  });
  return days.map((b) => {
    const point = { label: b.label, trust: b.trustN ? Math.round(b.trustSum / b.trustN) : null };
    TREND_METRICS.forEach((m) => {
      const n = b.metricN[m.key] || 0;
      const avg = n ? b.metricSums[m.key] / n : null;
      point[m.abbr] = avg == null ? null : Math.round(avg * 100);
    });
    return point;
  });
}

export default function EpistemicTrendChart({ versions }) {
  const series = useMemo(() => build30Day(versions), [versions]);

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={series} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 10 }} stroke="rgba(255,255,255,0.1)" interval={3} />
        <YAxis domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 11 }} stroke="rgba(255,255,255,0.1)" />
        <Tooltip
          contentStyle={{ background: '#0B0F16', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: '#94a3b8' }}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Line type="monotone" dataKey="trust" name="Trustworthy Rate" stroke="#34D399" strokeWidth={2.5} dot={{ r: 2, fill: '#34D399' }} connectNulls />
        {TREND_METRICS.map((m) => (
          <Line
            key={m.abbr}
            type="monotone"
            dataKey={m.abbr}
            name={`${m.abbr}${m.lowerBetter ? ' ↓' : ''}`}
            stroke={m.color}
            strokeWidth={1.5}
            dot={false}
            connectNulls
            strokeDasharray="4 3"
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}