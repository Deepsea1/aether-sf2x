import React, { useState } from 'react';
import { ShieldCheck, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';

const MATURITY = {
  enterprise: { label: 'Enterprise-grade', ring: 'ring-emerald-400/40', text: 'text-emerald-300', bg: 'bg-emerald-400/10' },
  certified: { label: 'Certified', ring: 'ring-sky-400/40', text: 'text-sky-300', bg: 'bg-sky-400/10' },
  verified: { label: 'Verified', ring: 'ring-teal-400/40', text: 'text-teal-300', bg: 'bg-teal-400/10' },
};

export function tagMaturity(trust, warrant, review, certified) {
  if (!warrant || warrant.validity_status !== 'valid') return null;
  if (certified) return MATURITY.certified;
  if (review?.status === 'approved' && trust >= 85) return MATURITY.enterprise;
  if (trust >= 75) return MATURITY.verified;
  return null;
}

export default function VerifiedTag({ trust, warrant, review, certified }) {
  const [open, setOpen] = useState(false);
  const m = tagMaturity(trust, warrant, review, certified);
  if (!m) return null;
  const sources = warrant?.sources?.length || 0;

  return (
    <div className="rounded-xl border border-white/10 bg-[#0B0F16] overflow-hidden">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between gap-2 px-3 py-2.5 hover:bg-white/[0.02]">
        <span className="flex items-center gap-2">
          <span className={`flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-full ring-1 ${m.bg} ${m.ring} ${m.text}`}>
            <ShieldCheck className="h-3.5 w-3.5" /> Verified by SF2X · {m.label}
          </span>
          <span className="text-[10px] text-slate-600">click for proof</span>
        </span>
        {open ? <ChevronUp className="h-3.5 w-3.5 text-slate-500" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-500" />}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2 border-t border-white/5 pt-2">
          <p className="text-[11px] text-slate-400">Verified by SF2X means this output has evidence, provenance, and a verifiable audit trail.</p>
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div><span className="text-slate-500">Evidence:</span> <span className="text-slate-300">valid warrant</span></div>
            <div><span className="text-slate-500">Sources:</span> <span className="text-slate-300">{sources}</span></div>
            <div><span className="text-slate-500">Trust:</span> <span className="text-slate-300">{trust}/100</span></div>
            <div><span className="text-slate-500">Review:</span> <span className="text-slate-300">{review?.status || 'auto'}</span></div>
          </div>
          <div className="flex items-center gap-3 pt-1">
            <Link to="/lineage" className="text-[11px] text-emerald-300 hover:text-emerald-200 flex items-center gap-1">Provenance chain <ExternalLink className="h-3 w-3" /></Link>
            <Link to="/governance" className="text-[11px] text-sky-300 hover:text-sky-200 flex items-center gap-1">Audit trail <ExternalLink className="h-3 w-3" /></Link>
          </div>
        </div>
      )}
    </div>
  );
}