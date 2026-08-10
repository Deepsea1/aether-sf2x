import React, { useState } from 'react';
import { LayoutDashboard, Gavel, Server, KeyRound, Settings, Mail } from 'lucide-react';
import AppShell from '@/components/sf2x/AppShell';
import ApiKeysPanel from '@/components/sf2x/owner/ApiKeysPanel';
import SettingsPanel from '@/components/sf2x/owner/SettingsPanel';
import SubscribersPanel from '@/components/sf2x/owner/SubscribersPanel';
import { GovernanceContent } from '@/pages/Governance';
import { SystemsContent } from '@/pages/Systems';

const TABS = [
  { key: 'reviews', label: 'Reviews', Icon: Gavel },
  { key: 'systems', label: 'Systems', Icon: Server },
  { key: 'keys', label: 'API Keys', Icon: KeyRound },
  { key: 'settings', label: 'Settings', Icon: Settings },
  { key: 'subscribers', label: 'Subscribers', Icon: Mail },
];

export default function OwnerDashboard() {
  const [tab, setTab] = useState('reviews');

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-emerald-400/80 mb-2">
            <LayoutDashboard className="h-3.5 w-3.5" /> Owner Dashboard
          </div>
          <h1 className="font-heading text-xl font-semibold text-white">Owner Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1.5 max-w-2xl">
            Everything in one place — usage stats, review queue, system governance, API keys, settings, and subscribers. (synced)
          </p>
        </div>

        <div className="flex gap-1 border-b border-white/10 overflow-x-auto no-scrollbar">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
                tab === t.key ? 'border-emerald-400 text-white' : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              <t.Icon className="h-4 w-4" /> {t.label}
            </button>
          ))}
        </div>

        {tab === 'reviews' && <GovernanceContent />}
        {tab === 'systems' && <SystemsContent />}
        {tab === 'keys' && <ApiKeysPanel />}
        {tab === 'settings' && <SettingsPanel />}
        {tab === 'subscribers' && <SubscribersPanel />}
      </div>
    </AppShell>
  );
}