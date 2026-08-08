import React, { useState } from 'react';
import { MessageSquare, Compass } from 'lucide-react';
import AppShell from '@/components/sf2x/AppShell';
import { ConsoleContent } from '@/pages/Home';
import { ExploreContent } from '@/pages/Explore';
import AskStats from '@/components/sf2x/AskStats';

const TABS = [
  { key: 'ask', label: 'Ask', Icon: MessageSquare, Comp: ConsoleContent },
  { key: 'explore', label: 'Explore', Icon: Compass, Comp: ExploreContent },
];

export default function AskHub() {
  const [tab, setTab] = useState('ask');
  const active = TABS.find((t) => t.key === tab) || TABS[0];

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto">
        {tab === 'ask' && <AskStats />}
        <div className="mb-6">
          <h1 className="font-heading text-xl font-semibold text-white">Ask</h1>
          <p className="text-sm text-slate-500 mt-1">Ask a question and get a warranted, trust-scored answer.</p>
        </div>
        <div className="flex gap-1 border-b border-white/10 overflow-x-auto no-scrollbar mb-6">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${tab === t.key ? 'border-emerald-400 text-white' : 'border-transparent text-slate-500 hover:text-slate-300'}`}>
              <t.Icon className="h-4 w-4" /> {t.label}
            </button>
          ))}
        </div>
        <active.Comp />
      </div>
    </AppShell>
  );
}