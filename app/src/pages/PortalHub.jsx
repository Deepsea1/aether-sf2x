import React, { useState, lazy, Suspense } from 'react';
import { CreditCard, Crown, BarChart3, KeyRound, DollarSign, History } from 'lucide-react';
import AppShell from '@/components/sf2x/AppShell';

const CustomerPortal = lazy(() => import('@/pages/CustomerPortal'));
const UpgradeQueue = lazy(() => import('@/pages/UpgradeQueue'));
const ApiUsage = lazy(() => import('@/pages/ApiUsage'));
const DeveloperKeys = lazy(() => import('@/pages/DeveloperKeys'));
const CostAnalysis = lazy(() => import('@/pages/CostAnalysis'));
const VerificationHistory = lazy(() => import('@/pages/VerificationHistory'));

const TABS = [
  { key: 'portal', label: 'Portal', Icon: CreditCard, Comp: CustomerPortal },
  { key: 'upgrade', label: 'Upgrade', Icon: Crown, Comp: UpgradeQueue },
  { key: 'api-usage', label: 'API Usage', Icon: BarChart3, Comp: ApiUsage },
  { key: 'developer-keys', label: 'API Keys', Icon: KeyRound, Comp: DeveloperKeys },
  { key: 'cost', label: 'Cost Analysis', Icon: DollarSign, Comp: CostAnalysis },
  { key: 'history', label: 'History', Icon: History, Comp: VerificationHistory },
];

export default function PortalHub() {
  const [tab, setTab] = useState('portal');
  const active = TABS.find((t) => t.key === tab) || TABS[0];

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="font-heading text-xl font-semibold text-white">Account</h1>
          <p className="text-sm text-slate-500 mt-1">Subscription, usage, API keys, billing, and verification history.</p>
        </div>
        <div className="flex gap-1 border-b border-white/10 overflow-x-auto no-scrollbar mb-6">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${tab === t.key ? 'border-emerald-400 text-white' : 'border-transparent text-slate-500 hover:text-slate-300'}`}>
              <t.Icon className="h-4 w-4" /> {t.label}
            </button>
          ))}
        </div>
        <Suspense fallback={<div className="flex items-center justify-center py-24"><div className="w-7 h-7 border-2 border-white/20 border-t-emerald-400 rounded-full animate-spin" /></div>}>
          <active.Comp />
        </Suspense>
      </div>
    </AppShell>
  );
}