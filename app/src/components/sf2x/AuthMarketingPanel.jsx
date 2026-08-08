import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, Swords, FileCheck2, Gauge, ArrowRight } from 'lucide-react';

// Marketing panel shown on the left of the auth screens (desktop only).
// Turns the bare login page into a real pitch so the login gate itself
// communicates what Aether does, who it's for, and why pick it — plus an
// escape hatch to the public tools so discovery isn't fully dead.
export default function AuthMarketingPanel() {
  return (
    <div className="hidden lg:block px-2">
      <Link to="/" className="inline-flex items-center gap-2.5 mb-8">
        <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center">
          <ShieldCheck className="h-5 w-5 text-[#070A0F]" strokeWidth={2.5} />
        </div>
        <div className="leading-none">
          <span className="font-heading font-semibold text-foreground">Aether</span>
          <span className="block text-[10px] uppercase tracking-[0.16em] text-muted-foreground mt-0.5">The Truth Layer for AI</span>
        </div>
      </Link>

      <h2 className="font-heading text-3xl xl:text-4xl font-semibold text-foreground tracking-tight leading-[1.1]">
        Don't trust. <span className="text-emerald-500">Verify.</span>
      </h2>
      <p className="mt-4 text-sm text-muted-foreground leading-relaxed max-w-md">
        One button that tells you if an AI answer is true. Aether runs a 3-model tribunal — proposer, critic, verifier — flags hallucinations in real time, and issues a cryptographically signed warrant for every verified answer.
      </p>

      <div className="mt-6 space-y-3">
        {[
          { Icon: Swords, t: '3-model tribunal', d: 'Independent AIs answer, cross-examine, and reconcile.' },
          { Icon: FileCheck2, t: 'Signed warrants', d: 'Source-snapshotted proof behind every verified claim.' },
          { Icon: Gauge, t: 'Benchmark 91/100', d: 'Public leaderboard ranks models by trustworthiness.' },
        ].map((f) => (
          <div key={f.t} className="flex items-start gap-3">
            <f.Icon className="h-5 w-5 text-emerald-500 mt-0.5 shrink-0" />
            <div>
              <div className="text-sm font-medium text-foreground">{f.t}</div>
              <div className="text-[12px] text-muted-foreground">{f.d}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-7 rounded-xl border border-border bg-card p-4">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">Why Aether, not another tool?</div>
        <p className="text-[12px] text-muted-foreground leading-relaxed">
          Notion, Linear, and ClickUp organize your work. Aether verifies your AI's <span className="text-foreground font-medium">truth</span>. Built for teams who can't afford a hallucination — compliance, legal, medical, finance.
        </p>
      </div>

      <Link to="/playground" className="mt-6 inline-flex items-center gap-1.5 text-sm text-emerald-500 font-medium hover:underline">
        Try it free — no signup <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}