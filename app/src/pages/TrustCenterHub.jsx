import React, { useState, lazy, Suspense } from 'react';
import { ShieldCheck, GitBranch, Trophy, Waves, FileText, FileSpreadsheet, FileCheck, BarChart3, BookOpen, Activity } from 'lucide-react';
import AppShell from '@/components/sf2x/AppShell';

const TrustCenter = lazy(() => import('@/pages/TrustCenter'));
const Lineage = lazy(() => import('@/pages/Lineage'));
const Bench = lazy(() => import('@/pages/Bench'));
const ModelDrift = lazy(() => import('@/pages/ModelDrift'));
const Report = lazy(() => import('@/pages/Report'));
const Batch = lazy(() => import('@/pages/Batch'));
const Evidence = lazy(() => import('@/pages/Evidence'));
const Analytics = lazy(() => import('@/pages/Analytics'));
const Grounding = lazy(() => import('@/pages/Grounding'));
const Health = lazy(() => import('@/pages/Health'));

const TABS = [
  { key: 'overview', label: 'Overview', Icon: ShieldCheck, Comp: TrustCenter },
  { key: 'lineage', label: 'Lineage', Icon: GitBranch, Comp: Lineage },
  { key: 'bench', label: 'Bench', Icon: Trophy, Comp: Bench },
  { key: 'drift', label: 'Drift', Icon: Waves, Comp: ModelDrift },
  { key: 'report', label: 'Report', Icon: FileText, Comp: Report },
  { key: 'batch', label: 'Batch', Icon: FileSpreadsheet, Comp: Batch },
  { key: 'evidence', label: 'Evidence', Icon: FileCheck, Comp: Evidence },
  { key: 'analytics', label: 'Analytics', Icon: BarChart3, Comp: Analytics },
  { key: 'grounding', label: 'Grounding', Icon: BookOpen, Comp: Grounding },
  { key: 'health', label: 'Health', Icon: Activity, Comp: Health },
];

export default function TrustCenterHub() {
  const [tab, setTab] = useState('overview');
  const active = TABS.find((t) => t.key === tab) || TABS[0];

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="font-heading text-xl font-semibold text-white">Trust Center</h1>
          <p className="text-sm text-slate-500 mt-1">Provenance, benchmarks, drift, reports, and audit evidence — all in one place.</p>
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