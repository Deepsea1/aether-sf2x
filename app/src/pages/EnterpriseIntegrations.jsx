import React from 'react';
import { MessageSquare, GitBranch, FileText, CheckSquare, ArrowRight, Zap } from 'lucide-react';
import PublicNav from '@/components/sf2x/PublicNav';

const INTEGRATIONS = [
  {
    Icon: MessageSquare,
    name: 'Slack',
    color: 'text-violet-400',
    borderColor: 'border-violet-400/20',
    bgColor: 'bg-violet-400/[0.03]',
    desc: 'Get real-time alerts when Aether detects a hallucination in your team\'s AI workflows. Auto-post warrant summaries in channels.',
    features: ['Hallucination alerts in #ai-trust', 'Inline warrant verification on AI messages', 'Kill-switch notifications', 'Daily trust digest'],
    status: 'Available',
    connected: false,
  },
  {
    Icon: CheckSquare,
    name: 'Jira',
    color: 'text-sky-400',
    borderColor: 'border-sky-400/20',
    bgColor: 'bg-sky-400/[0.03]',
    desc: 'Auto-create tickets when AI-generated content fails verification. Track hallucination fixes through your existing sprint workflow.',
    features: ['Auto-ticket failed verifications', 'Warrant evidence attached to tickets', 'Sprint-level trust metrics', 'Approval workflows with warrant gates'],
    status: 'Available',
    connected: false,
  },
  {
    Icon: GitBranch,
    name: 'GitHub',
    color: 'text-emerald-400',
    borderColor: 'border-emerald-400/30',
    bgColor: 'bg-emerald-400/[0.05]',
    desc: 'Block hallucinated AI code or documentation from merging. Aether sets commit statuses on AI-generated PRs — failing builds block merges when branch protection is configured.',
    features: ['Commit/PR status checks (repo:status)', 'Block merges on low-trust AI output', 'CI/CD integration via backend function', 'Warrant link in status target URL'],
    status: 'Connected · repo:status',
    connected: true,
  },
  {
    Icon: FileText,
    name: 'Notion',
    color: 'text-emerald-400',
    borderColor: 'border-emerald-400/20',
    bgColor: 'bg-emerald-400/[0.03]',
    desc: 'Verify AI-generated content in your Notion docs. Warrant badges appear inline next to AI-written sections.',
    features: ['Inline warrant badges on AI content', 'Auto-flag stale warrants', 'Team trust dashboard page', 'Export warrant evidence to docs'],
    status: 'Available',
    connected: false,
  },
];

export default function EnterpriseIntegrations() {
  return (
    <div className="min-h-screen bg-[#070A0F] text-slate-200">
      <PublicNav />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-20">
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-400/10 text-emerald-300 text-xs font-medium mb-4">
            <Zap className="h-3.5 w-3.5" /> Enterprise
          </div>
          <h1 className="text-4xl sm:text-5xl font-heading font-bold text-white tracking-tight">Aether for Teams</h1>
          <p className="mt-4 text-lg text-slate-400 max-w-2xl mx-auto">
            The truth layer for your existing tools. Aether verifies AI output where your team already works.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-12">
          {INTEGRATIONS.map(int => (
            <div key={int.name} className={`rounded-2xl border ${int.borderColor} ${int.bgColor} p-6`}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-white/5 flex items-center justify-center">
                    <int.Icon className={`h-5 w-5 ${int.color}`} />
                  </div>
                  <h2 className="text-xl font-heading font-semibold text-white">{int.name}</h2>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${int.color} ${int.bgColor} border ${int.borderColor}`}>{int.status}</span>
              </div>
              <p className="text-sm text-slate-400 leading-relaxed mb-4">{int.desc}</p>
              <ul className="space-y-2">
                {int.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-slate-400">
                    <ArrowRight className={`h-3 w-3 mt-0.5 shrink-0 ${int.color}`} />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-8 text-center">
          <h2 className="text-xl font-heading font-semibold text-white mb-3">Become a Truth-First Team</h2>
          <p className="text-sm text-slate-400 max-w-xl mx-auto mb-6">
            Every AI-generated output in your organization carries a verifiable warrant. No more guessing if the AI hallucinated — the proof is right there.
          </p>
          <a href="/enterprise" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-500 text-[#070A0F] font-semibold hover:bg-emerald-400 transition-colors">
            Talk to Us <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    </div>
  );
}