import React from 'react';
import { Swords } from 'lucide-react';
import ResponsiveSelect from '@/components/sf2x/ResponsiveSelect';
import { ALL_MODELS } from '@/lib/sf2xBench';
import CompanyBadge from '@/components/sf2x/CompanyBadge';
import { DEFAULT_TRIO } from '@/lib/sf2xCompanies';

// Three-slot picker for the hardened 3-way tribunal. Defaults to the cross-firm
// trio (Anthropic / Google / OpenAI); the user can swap each slot to any model.
// Shown in the Console only when stakes are medium/high/critical (low = single).
export default function TribunalPicker({ models, setModels }) {
  const trio = (models && models.length === 3) ? models : [...DEFAULT_TRIO];
  const options = ALL_MODELS.map((m) => ({ value: m.value, label: m.label }));

  function setSlot(i, value) {
    const next = [...trio];
    next[i] = value;
    setModels(next);
  }

  return (
    <div className="mt-3 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.04] p-3">
      <div className="flex items-center gap-2 mb-2">
        <Swords className="h-3.5 w-3.5 text-emerald-300" />
        <span className="text-[11px] uppercase tracking-wider text-emerald-300">3-way tribunal · hardened answer</span>
        <span className="text-[10px] text-slate-500 hidden sm:inline">— 3 AIs answer, cross-examine each other, reconcile, merge</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {[0, 1, 2].map((i) => {
          const m = ALL_MODELS.find((x) => x.value === trio[i]);
          return (
            <div key={i} className="flex flex-col gap-1">
              <span className="text-[10px] text-slate-500 flex items-center gap-1">
                <span className="font-mono text-slate-600">#{i + 1}</span>
                {m && <CompanyBadge company={m.tag} showName={false} />}
              </span>
              <ResponsiveSelect
                value={trio[i]}
                onValueChange={(v) => setSlot(i, v)}
                options={options}
                placeholder={`Model ${i + 1}`}
                triggerClassName="h-11 md:h-9 rounded-lg border border-white/10 bg-[#0B0F16] px-3 text-sm text-slate-200"
              />
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[10px] text-slate-500">~10 LLM calls per question. Default is three independent labs so no model grades its own output; pick any three.</p>
    </div>
  );
}