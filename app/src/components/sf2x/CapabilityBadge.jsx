import React from 'react';
import { ShieldCheck, Eye, ShieldQuestion, ShieldAlert, ShieldX } from 'lucide-react';
import { computeTrustworthyRate } from '@/lib/sf2x';
import { assessCapability } from '@/lib/sf2xGovernance';

const ICONS = [ShieldCheck, ShieldCheck, Eye, ShieldQuestion, ShieldAlert];

export default function CapabilityBadge({ stakes, metrics, warrant }) {
  const trust = computeTrustworthyRate(metrics, warrant);
  const cap = assessCapability(stakes, trust, warrant);
  const Icon = cap.killSwitch ? ShieldX : ICONS[cap.level] || ShieldCheck;
  return (
    <div className={`inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full ring-1 ${cap.bg} ${cap.ring} ${cap.text}`}>
      <Icon className="h-3.5 w-3.5" />
      <span className="font-mono">{cap.key}</span>
      <span className="opacity-90">· {cap.label}</span>
      {cap.requiresReview && <span className="opacity-70">· needs review</span>}
    </div>
  );
}