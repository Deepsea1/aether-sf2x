import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, FileText } from 'lucide-react';
import PublicNav from '@/components/sf2x/PublicNav';

const SECTIONS = [
  {
    h: '1. Acceptance of Terms',
    p: 'By accessing or using Aether ("the Service"), operated by SF2X, you agree to be bound by these Terms of Service. If you do not agree, do not use the Service.',
  },
  {
    h: '2. Description of the Service',
    p: 'Aether is an AI trust and verification layer. It scores AI-generated answers for trustworthiness, detects likely hallucinations, and issues cryptographic warrants attesting to the provenance and grounding of claims. The Service includes APIs, embeddable widgets, a browser extension, dashboards, and benchmarking tools.',
  },
  {
    h: '3. No Warranty; Probabilistic, Not Definitive',
    p: 'Aether trust scores, warrants, verdicts, and corrections are probabilistic, heuristic estimates — NOT ground truth. They reflect the state of available sources, calibration thresholds, and model reasoning at the time of evaluation, which may be incomplete, biased, or stale. The Service does not guarantee that any answer is factually correct or that a hallucination has or has not occurred. You bear sole responsibility for decisions made in reliance on the Service.',
  },
  {
    h: '4. Acceptable Use',
    p: 'You agree not to: (a) use the Service to make legally binding or safety-critical decisions without independent human review; (b) attempt to reverse-engineer, extract, or abuse the scoring or warrant models; (c) submit content that is unlawful, infringing, or harmful; (d) resell or redistribute access without a written agreement; or (e) interfere with the Service or its infrastructure.',
  },
  {
    h: '5. Accounts and API Keys',
    p: 'You are responsible for safeguarding your account credentials and API keys. All activity under your keys is your responsibility. Notify us promptly of any unauthorized use. API keys are metered; usage over your plan quota may be rejected or billed per your plan.',
  },
  {
    h: '6. Subscriptions, Payment, and Refunds',
    p: 'Paid plans are billed in advance via our payment processor (Stripe). You authorize recurring charges until you cancel. You may cancel at any time; cancellation takes effect at the end of the current billing period. Fees are non-refundable except where required by law. We may change pricing with at least 30 days notice.',
  },
  {
    h: '7. API Usage and Rate Limits',
    p: 'Each plan includes a monthly verification quota and rate limits. We may throttle or reject requests that exceed your plan. Bulk, automated, or abusive traffic may be suspended. We may offer batch and streaming endpoints subject to separate limits.',
  },
  {
    h: '8. Intellectual Property',
    p: 'We retain all rights to the Service, including scoring models, warrant formats, benchmarks, and branding. Warrants issued to you may be displayed publicly under the terms of your plan. You retain rights to content you submit; you grant us a limited license to process it solely to provide the Service.',
  },
  {
    h: '9. Open-Source and Third-Party Materials',
    p: 'The Service may incorporate or reference open-source software and third-party data. Open-source components remain under their respective licenses. Third-party data reflects its sources and may carry their own terms.',
  },
  {
    h: '10. Limitation of Liability',
    p: 'To the maximum extent permitted by law, the Service is provided "as is" and "as available," and neither SF2X nor its affiliates, officers, employees, or licensors shall be liable for any indirect, incidental, special, consequential, or exemplary damages, or for loss of profits, data, business, or goodwill, arising from your use of the Service — even if advised of the possibility of such damages. Our aggregate liability is limited to the amount you paid us in the preceding 12 months.',
  },
  {
    h: '11. Indemnification',
    p: 'You agree to indemnify and hold SF2X harmless from claims, damages, and expenses arising from your use of the Service, your violation of these Terms, or your infringement of any third-party rights.',
  },
  {
    h: '12. Term and Termination',
    p: 'We may suspend or terminate access immediately if you breach these Terms or pose a risk to the Service. You may stop using the Service at any time. Upon termination, your right to use the Service ends; accrued obligations survive.',
  },
  {
    h: '13. Governing Law and Disputes',
    p: 'These Terms are governed by the laws of the State of Delaware, USA, without regard to conflict-of-laws principles. The parties consent to exclusive jurisdiction and venue in the state and federal courts located in Delaware, except where prohibited.',
  },
  {
    h: '14. Changes to These Terms',
    p: 'We may update these Terms from time to time. Material changes will be posted with an updated "Last revised" date. Continued use after changes constitutes acceptance.',
  },
  {
    h: '15. Contact',
    p: 'Questions about these Terms? Contact us at the address on our Contact page.',
  },
];

export default function Terms() {
  return (
    <div className="min-h-screen bg-background text-foreground pb-[env(safe-area-inset-bottom)]">
      <PublicNav />
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex items-center gap-2.5 mb-2">
          <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center">
            <FileText className="h-5 w-5 text-[#070A0F]" strokeWidth={2.5} />
          </div>
          <Link to="/" className="font-heading font-semibold text-foreground">Aether</Link>
        </div>
        <h1 className="font-heading text-3xl font-semibold text-foreground tracking-tight mt-4">Terms of Service</h1>
        <p className="text-xs text-slate-500 mt-1.5">Last revised: August 1, 2026</p>

        <div className="mt-6 rounded-xl border border-amber-400/20 bg-amber-400/[0.05] p-4 text-[13px] text-amber-200/90">
          <strong className="text-amber-200">Important:</strong> Aether scores are probabilistic estimates, not ground truth. These Terms clarify the limits of the Service and allocate risk accordingly.
        </div>

        <div className="mt-8 space-y-6">
          {SECTIONS.map((s) => (
            <section key={s.h}>
              <h2 className="font-heading text-base font-semibold text-foreground mb-1.5">{s.h}</h2>
              <p className="text-sm text-slate-400 leading-relaxed">{s.p}</p>
            </section>
          ))}
        </div>

        <footer className="mt-10 pt-6 border-t border-white/5 text-[11px] text-slate-600 flex items-center gap-3">
          <Link to="/privacy" className="hover:text-slate-300">Privacy Policy</Link>
          <Link to="/contact" className="hover:text-slate-300">Contact</Link>
          <Link to="/" className="hover:text-slate-300">Home</Link>
          <span className="ml-auto">Aether · The Truth Layer for AI · Don't trust. Verify.</span>
        </footer>
      </div>
    </div>
  );
}