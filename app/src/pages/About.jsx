import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import PublicNav from '@/components/sf2x/PublicNav';

export default function About() {
  return (
    <div className="min-h-screen bg-[#070A0F] text-slate-200">
      <PublicNav />
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-10">

        <article className="prose prose-invert max-w-none">
          <h1 className="font-heading text-3xl sm:text-4xl font-semibold text-white tracking-tight">About SF2X</h1>
          <p className="mt-6 text-slate-300 leading-relaxed">
            SF2X is an epistemic operating system that eliminates AI hallucinations by attaching an
            auditable decision warrant to every answer an AI produces. Where a conventional model
            returns a confident-sounding string, SF2X returns the same answer together with its
            premises, cited sources, a signed validity hash, a confidence score, and a full
            lineage of every revision and correction. The result is intelligence you can trust,
            verify, and govern — not just consume.
          </p>
          <p className="mt-4 text-slate-300 leading-relaxed">
            SF2X is built for teams deploying AI in high-stakes domains where being wrong is
            expensive or dangerous: medicine, finance, legal, compliance, defense, and critical
            infrastructure. It serves the AI engineer who needs proof an answer is safe to ship, the
            reviewer who must audit how a conclusion was reached, the compliance officer who needs a
            defensible paper trail, and the executive who needs a measurable epistemic health score
            across every model in production. Through governance gates, multi-agent tribunal
            debates, red-team resistance testing, and drift detection, SF2X turns unreliable model
            output into governed, warrant-backed knowledge.
          </p>
          <p className="mt-4 text-slate-300 leading-relaxed">
            SF2X is built by the SF2X team, an applied-AI research and engineering group focused on
            epistemic safety, provenance, and accountable machine intelligence. We believe the next
            generation of AI systems will be judged not by fluency, but by whether their claims can
            be traced, challenged, and corrected — and we build the operating system that makes that
            standard possible.
          </p>
        </article>

        <footer className="mt-14 pt-6 border-t border-white/5 flex items-center justify-between text-[11px] text-slate-600">
          <span>SF2X · Epistemic Operating System</span>
          <div className="flex items-center gap-4">
            <Link to="/about" className="hover:text-slate-300">About</Link>
            <Link to="/contact" className="hover:text-slate-300">Contact</Link>
            <Link to="/pricing" className="hover:text-slate-300">Pricing</Link>
          </div>
        </footer>
      </div>
    </div>
  );
}