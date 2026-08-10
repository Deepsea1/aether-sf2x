import React, { useState, lazy, Suspense } from 'react';
import { Trophy, BarChart3, GitCompare, Layers, Swords, Award } from 'lucide-react';
import AppShell from '@/components/sf2x/AppShell';

const Leaderboard = lazy(() => import('@/pages/Leaderboard').then(m => ({ default: m.LeaderboardContent })));
const Benchmark = lazy(() => import('@/pages/Benchmark').then(m => ({ default: m.BenchmarkContent })));
const Compare = lazy(() => import('@/pages/Compare').then(m => ({ default: m.CompareContent })));
const MultiModelCompare = lazy(() => import('@/pages/MultiModelCompare').then(m => ({ default: m.MultiModelCompareContent })));
const RedTeamArena = lazy(() => import('@/pages/RedTeamArena').then(m => ({ default: m.RedTeamArenaContent })));
const HallOfFame = lazy(() => import('@/pages/HallOfFame').then(m => ({ default: m.HallOfFameContent })));

const TABS = [
  { key: 'leaderboard', label: 'Leaderboard', Icon: Trophy, Comp: Leaderboard },
  { key: 'benchmark', label: 'Benchmark', Icon: BarChart3, Comp: Benchmark },
  { key: 'compare', label: 'Compare', Icon: GitCompare, Comp: Compare },
  { key: 'multi-model', label: 'Multi-Model', Icon: Layers, Comp: MultiModelCompare },
  { key: 'arena', label: 'Arena', Icon: Swords, Comp: RedTeamArena },
  { key: 'hall-of-fame', label: 'Hall of Fame', Icon: Award, Comp: HallOfFame },
];

export default function Showcase() {
  const [tab, setTab] = useState('leaderboard');
  const active = TABS.find((t) => t.key === tab) || TABS[0];

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="font-heading text-xl font-semibold text-white">Showcase</h1>
          <p className="text-sm text-slate-500 mt-1">Leaderboards, benchmarks, model comparisons, and the Red-Team Arena.</p>
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