import React from 'react';
import { Rocket, ShieldCheck, Zap, Plug, BarChart3, GitBranch, Calendar } from 'lucide-react';
import PublicNav from '@/components/sf2x/PublicNav';

const QUARTERS = [
  {
    quarter: 'Q3 2026',
    status: 'In Progress',
    color: 'emerald',
    Icon: Rocket,
    items: [
      { title: 'Monthly Hallucination Report', desc: 'Public monthly digest of worst AI hallucinations, top-performing models, domain breakdowns.', done: true },
      { title: 'Domain Benchmarks', desc: 'Finance, Medical, Legal, Safety — per-domain model performance and catch rates.', done: true },
      { title: 'Open-source Warrant Verifier', desc: 'Public signature spec + SDKs (Python, JS, Go). Anyone can verify a warrant.', done: false },
      { title: 'Public Hallucination Leaderboard', desc: 'Viral monthly leaderboard ranking models by hallucination rate.', done: true },
    ],
  },
  {
    quarter: 'Q4 2026',
    status: 'Next',
    color: 'sky',
    Icon: Zap,
    items: [
      { title: 'Inline Fast-Path Detector', desc: 'Sub-200ms instant hallucination flagging — Luna-style real-time feedback.', done: false },
      { title: 'Enterprise Integrations', desc: 'Slack, Jira, GitHub, Notion — Aether becomes the truth layer for teams.', done: false },
      { title: 'Browser Extension', desc: 'Real-time warrant verification on any AI chat interface (ChatGPT, Claude, Gemini).', done: false },
      { title: 'CI/CD GitHub Action', desc: 'Block hallucinated answers in your LLM pipeline before deploy.', done: false },
    ],
  },
  {
    quarter: 'Q1 2027',
    status: 'Planned',
    color: 'violet',
    Icon: BarChart3,
    items: [
      { title: 'Multi-Tenant Team Dashboards', desc: 'Organization-level warrant management, role-based access, audit trails.', done: false },
      { title: 'Real-time API Streaming', desc: 'WebSocket-based warrant delivery for production LLM applications.', done: false },
      { title: 'Calibration Marketplace', desc: 'Domain-specific calibration models contributed by experts.', done: false },
      { title: 'BYOK Enterprise Tier', desc: 'Bring your own model keys — unlimited verification on client accounts.', done: false },
    ],
  },
  {
    quarter: 'Q2 2027',
    status: 'Vision',
    color: 'amber',
    Icon: GitBranch,
    items: [
      { title: 'Warrant Standard RFC', desc: 'Submit the warrant specification as an industry standard (IETF/W3C).', done: false },
      { title: 'Cross-Platform SDK', desc: 'Native iOS/Android warrant verification for mobile AI apps.', done: false },
      { title: 'Regulator Portal', desc: 'Direct API for EU AI Act / NIST compliance audits.', done: false },
      { title: 'Decentralized Verification', desc: 'Warrant attestation network — distributed verification nodes.', done: false },
    ],
  },
];

const colorMap = {
  emerald: { text: 'text-emerald-300', bg: 'bg-emerald-400/10', border: 'border-emerald-400/20', dot: 'bg-emerald-400' },
  sky: { text: 'text-sky-300', bg: 'bg-sky-400/10', border: 'border-sky-400/20', dot: 'bg-sky-400' },
  violet: { text: 'text-violet-300', bg: 'bg-violet-400/10', border: 'border-violet-400/20', dot: 'bg-violet-400' },
  amber: { text: 'text-amber-300', bg: 'bg-amber-400/10', border: 'border-amber-400/20', dot: 'bg-amber-400' },
};

export default function Roadmap() {
  return (
    <div className="min-h-screen bg-[#070A0F] text-slate-200">
      <PublicNav />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-20">
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-400/10 text-emerald-300 text-xs font-medium mb-4">
            <Calendar className="h-3.5 w-3.5" /> Product Roadmap
          </div>
          <h1 className="text-4xl sm:text-5xl font-heading font-bold text-white tracking-tight">Where Aether Is Going</h1>
          <p className="mt-4 text-lg text-slate-400 max-w-2xl mx-auto">
            From warrant infrastructure to the universal truth layer for AI.
          </p>
        </div>

        <div className="space-y-8">
          {QUARTERS.map(q => {
            const c = colorMap[q.color];
            return (
              <div key={q.quarter} className={`rounded-2xl border ${c.border} bg-[#0B0F16] overflow-hidden`}>
                <div className={`flex items-center gap-3 px-6 py-4 border-b ${c.border}`}>
                  <div className={`h-10 w-10 rounded-lg ${c.bg} flex items-center justify-center`}>
                    <q.Icon className={`h-5 w-5 ${c.text}`} />
                  </div>
                  <div>
                    <h2 className="text-lg font-heading font-bold text-white">{q.quarter}</h2>
                    <span className={`text-xs ${c.text}`}>{q.status}</span>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-white/5">
                  {q.items.map(item => (
                    <div key={item.title} className="bg-[#0B0F16] p-5">
                      <div className="flex items-start gap-2">
                        <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${item.done ? c.dot : 'bg-white/15'}`} />
                        <div>
                          <h3 className="text-sm font-medium text-slate-200">{item.title}</h3>
                          <p className="text-xs text-slate-500 mt-1 leading-relaxed">{item.desc}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-12 text-center">
          <a href="/pitch" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-white/15 text-slate-200 font-medium hover:bg-white/5 transition-colors">
            <ShieldCheck className="h-4 w-4" /> View Pitch Deck
          </a>
        </div>
      </div>
    </div>
  );
}