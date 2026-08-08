import React from 'react';
import { Link } from 'react-router-dom';

const ACCENTS = {
  emerald: 'text-emerald-300 bg-emerald-400/10',
  sky: 'text-sky-300 bg-sky-400/10',
  amber: 'text-amber-300 bg-amber-400/10',
  rose: 'text-rose-300 bg-rose-400/10',
  teal: 'text-teal-300 bg-teal-400/10',
  orange: 'text-orange-300 bg-orange-400/10',
  indigo: 'text-indigo-300 bg-indigo-400/10',
  slate: 'text-slate-300 bg-white/5',
};

export default function StatCard({ icon: Icon, label, value, suffix, accent = 'slate', to }) {
  const inner = (
    <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-4 transition-colors hover:border-white/20 hover:bg-white/[0.03] h-full">
      <div className="flex items-center gap-2 mb-2">
        <span className={`h-7 w-7 rounded-lg flex items-center justify-center ${ACCENTS[accent] || ACCENTS.slate}`}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="text-[11px] text-slate-500">{label}</span>
      </div>
      <div className="text-2xl font-semibold text-white">
        {value}<span className="text-sm text-slate-500">{suffix}</span>
      </div>
    </div>
  );
  return to ? <Link to={to} className="block">{inner}</Link> : inner;
}