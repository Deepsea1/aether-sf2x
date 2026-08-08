import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CheckCircle2, Circle, ArrowRight, Rocket, Sparkles, Swords, BarChart3, ShieldCheck, Download, Server, FileCheck2, Sheet } from 'lucide-react';
import AppShell from '@/components/sf2x/AppShell';
import { base44 } from '@/api/base44Client';

export default function GettingStarted() {
  const [counts, setCounts] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [inq, ver, war, rev, sys, bench] = await Promise.all([
          base44.entities.Inquiry.list(undefined, 1),
          base44.entities.AnswerVersion.list(undefined, 1),
          base44.entities.Warrant.list(undefined, 1),
          base44.entities.Review.list(undefined, 200),
          base44.entities.AISystem.list(undefined, 1),
          base44.entities.BenchResult.list(undefined, 1),
        ]);
        const len = (l) => (Array.isArray(l) ? l.length : l?.items?.length ?? 0);
        setCounts({
          inquiries: len(inq), versions: len(ver), warrants: len(war),
          pending: rev.filter((r) => r.status === 'pending' || r.status === 'flagged').length,
          systems: len(sys), bench: len(bench),
        });
      } catch {
        setCounts(null);
      }
    })();
  }, []);

  const steps = [
    { label: 'Connect Google Sheets export', done: true, desc: 'Authorized — audit + correction events export to your Drive sheet nightly.', icon: Sheet, to: '/governance' },
    { label: 'Seed demo data', done: (counts?.inquiries || 0) >= 5, desc: `Linked inquiries, warrants, corrections, reviews, red-team runs & debates so every dashboard renders.`, icon: FileCheck2, to: '/health' },
    { label: 'Run your first warranted inquiry', done: false, desc: 'Submit a high-stakes prompt on the Console; the engine reasons, issues a Decision Validity Warrant, and self-scores.', icon: Sparkles, to: '/' },
    { label: 'Compare AI models (Showdown)', done: false, desc: 'On Bench, run one prompt across Claude, Gemini, GPT-5 & Base44 and rank by epistemic trust.', icon: Swords, to: '/bench' },
    { label: 'Score the deployment', done: (counts?.bench || 0) > 0, desc: 'Compute the composite SF2X Bench score and check certification on Bench.', icon: BarChart3, to: '/bench' },
    { label: 'Clear the governance queue', done: (counts?.pending || 0) === 0, desc: `${counts?.pending ?? '…'} pending/flagged reviews waiting on Bench → Governance.`, icon: ShieldCheck, to: '/governance' },
    { label: 'Export audit to Sheets', done: false, desc: 'Governance → “Export to Sheets” writes governance decisions + corrections to your spreadsheet now.', icon: Download, to: '/governance' },
    { label: 'Register an AI system', done: (counts?.systems || 0) > 0, desc: 'Systems → register a governed deployment, set risk tier, and sign off release gates.', icon: Server, to: '/systems' },
    { label: 'Publish the Trust Center', done: true, desc: 'Public guarantees, risk framework, and live evidence are already live on the Trust Center.', icon: ShieldCheck, to: '/trust-center' },
  ];

  const howTo = [
    { n: 1, title: 'Ask', body: 'Open the Console, pick a domain + stakes, choose a model (or leave Base44 auto), and submit. Every answer is warranted and lineage-tracked.' },
    { n: 2, title: 'Verify', body: 'Read the trust score breakdown, the warrant premises, and the signed provenance hash. Low-trust or high-stakes answers are routed to human review.' },
    { n: 3, title: 'Correct', body: 'Revise an inquiry to generate v2; the engine logs a correction event, drift score, and time-to-correction automatically.' },
    { n: 4, title: 'Govern', body: 'Reviewers approve/reject/flag on Governance; kill-switches suppress regulated answers; every decision is written to the immutable audit log.' },
    { n: 5, title: 'Report', body: 'Export the audit trail to Google Sheets (manual or nightly) and share the Trust Center link for external assurance.' },
  ];

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Rocket className="h-5 w-5 text-emerald-400" />
          <div>
            <h1 className="font-heading text-xl font-semibold text-white">Getting Started</h1>
            <p className="text-sm text-slate-500">Your launch checklist and how-to for kicking SF2X off the ground.</p>
          </div>
        </div>

        {/* Checklist */}
        <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-slate-200">Launch Checklist</h2>
            <span className="text-[11px] text-slate-500">{steps.filter((s) => s.done).length}/{steps.length} ready</span>
          </div>
          <div className="space-y-2">
            {steps.map((s, i) => (
              <motion.div key={s.label} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
                className="flex items-center gap-3 rounded-lg bg-white/[0.02] border border-white/5 px-3 py-2.5">
                {s.done ? <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" /> : <Circle className="h-4 w-4 text-slate-600 shrink-0" />}
                <s.icon className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-slate-200">{s.label}</div>
                  <div className="text-[11px] text-slate-500 truncate">{s.desc}</div>
                </div>
                <Link to={s.to} className="text-[11px] text-emerald-300 hover:text-emerald-200 inline-flex items-center gap-1 shrink-0">
                  Open <ArrowRight className="h-3 w-3" />
                </Link>
              </motion.div>
            ))}
          </div>
        </div>

        {/* How to use */}
        <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent p-5">
          <h2 className="text-sm font-medium text-slate-200 mb-4">How to use SF2X</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {howTo.map((h) => (
              <div key={h.n} className="rounded-xl border border-white/10 bg-[#0B0F16] p-4">
                <div className="h-6 w-6 rounded-full bg-emerald-400/15 text-emerald-300 flex items-center justify-center text-xs font-semibold mb-2">{h.n}</div>
                <div className="text-sm text-slate-200 font-medium mb-1">{h.title}</div>
                <p className="text-[11px] text-slate-500 leading-relaxed">{h.body}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Quick links */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { to: '/', label: 'Console', desc: 'Submit warranted inquiries' },
            { to: '/health', label: 'Health', desc: 'Epistemic trend & metrics' },
            { to: '/collective', label: 'Collective', desc: 'Tribunal debate & red-team' },
            { to: '/lineage', label: 'Lineage', desc: 'Truth provenance chains' },
          ].map((q) => (
            <Link key={q.to} to={q.to} className="rounded-xl border border-white/10 bg-[#0B0F16] p-4 hover:border-emerald-400/30 transition-colors">
              <div className="text-sm text-slate-200 font-medium">{q.label}</div>
              <div className="text-[11px] text-slate-500">{q.desc}</div>
            </Link>
          ))}
        </div>
      </div>
    </AppShell>
  );
}