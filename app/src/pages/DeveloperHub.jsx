import React, { useState, lazy, Suspense } from 'react';
import { Code2, BookOpen, Puzzle, Layout, FileText, Database, FlaskConical, Github } from 'lucide-react';
import AppShell from '@/components/sf2x/AppShell';
import AgentGreeter from '@/components/sf2x/AgentGreeter';

const ApiDocs = lazy(() => import('@/pages/ApiDocs'));
const Sdk = lazy(() => import('@/pages/Sdk'));
const Extension = lazy(() => import('@/pages/Extension'));
const Embed = lazy(() => import('@/pages/Embed'));
const WarrantSpec = lazy(() => import('@/pages/WarrantSpec'));
const Registry = lazy(() => import('@/pages/Registry'));
const Methodology = lazy(() => import('@/pages/Methodology'));
const GitHubAction = lazy(() => import('@/pages/GitHubAction'));

const TABS = [
  { key: 'api-docs', label: 'API Docs', Icon: Code2, Comp: ApiDocs },
  { key: 'sdk', label: 'SDK', Icon: BookOpen, Comp: Sdk },
  { key: 'extension', label: 'Extension', Icon: Puzzle, Comp: Extension },
  { key: 'embed', label: 'Embed', Icon: Layout, Comp: Embed },
  { key: 'warrant-spec', label: 'Warrant Spec', Icon: FileText, Comp: WarrantSpec },
  { key: 'registry', label: 'Registry', Icon: Database, Comp: Registry },
  { key: 'methodology', label: 'Methodology', Icon: FlaskConical, Comp: Methodology },
  { key: 'github-action', label: 'GitHub Action', Icon: Github, Comp: GitHubAction },
];

export default function DeveloperHub() {
  const [tab, setTab] = useState('api-docs');
  const active = TABS.find((t) => t.key === tab) || TABS[0];

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="font-heading text-xl font-semibold text-white">Developer Hub</h1>
          <p className="text-sm text-slate-500 mt-1">API docs, SDKs, embeds, specs, and integration tools.</p>
          <div className="mt-2">
            <AgentGreeter
              agentKey="integration_support"
              to="/integration-support"
              firstGreeting="Hi! I'm your Integration Support assistant. I can help you connect your AI, generate API keys, set up webhooks, embed widgets, and install the extension. Click below and ask me anything."
              returningGreeting="I'm here if you need help with integrations."
              label="Ask integration support"
            />
          </div>
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