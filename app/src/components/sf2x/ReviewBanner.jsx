import React from 'react';
import { ShieldCheck, ShieldAlert, ShieldX, Clock, Flag } from 'lucide-react';

const STYLES = {
  pending: { icon: Clock, text: 'text-orange-300', bg: 'bg-orange-400/10', ring: 'ring-orange-400/30', label: 'Awaiting human review' },
  approved: { icon: ShieldCheck, text: 'text-emerald-300', bg: 'bg-emerald-400/10', ring: 'ring-emerald-400/30', label: 'Approved by reviewer' },
  rejected: { icon: ShieldAlert, text: 'text-rose-300', bg: 'bg-rose-400/10', ring: 'ring-rose-400/30', label: 'Rejected by reviewer' },
  flagged: { icon: Flag, text: 'text-amber-300', bg: 'bg-amber-400/10', ring: 'ring-amber-400/30', label: 'Flagged for follow-up' },
  killed: { icon: ShieldX, text: 'text-rose-300', bg: 'bg-rose-400/10', ring: 'ring-rose-400/30', label: 'Suppressed — not promoted' },
};

export default function ReviewBanner({ review }) {
  if (!review) return null;
  const s = STYLES[review.status] || STYLES.pending;
  const Icon = s.icon;
  return (
    <div className={`flex items-center gap-2 rounded-lg px-3 py-2 ring-1 ${s.bg} ${s.ring} ${s.text} text-xs`}>
      <Icon className="h-4 w-4 shrink-0" />
      <span className="font-medium">{s.label}</span>
      <span className="opacity-70 font-mono">{review.capability_level}</span>
      {review.decision && <span className="opacity-70 truncate">· {review.decision}</span>}
    </div>
  );
}