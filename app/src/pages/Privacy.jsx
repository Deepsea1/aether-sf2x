import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, Lock } from 'lucide-react';
import PublicNav from '@/components/sf2x/PublicNav';

const SECTIONS = [
  {
    h: '1. Information We Collect',
    p: 'We collect: (a) Account data — name, email, and role when you register. (b) Verification input — prompts and AI answers you submit for scoring, and cited sources. (c) Usage and telemetry — API calls, timestamps, model labels, latency, and request metadata. (d) Billing data — handled by our payment processor (Stripe); we do not store full card numbers. (e) Cookies and similar technologies for authentication and analytics.',
  },
  {
    h: '2. How We Use Your Information',
    p: 'To provide and improve the Service, operate verification and warranting pipelines, calculate trust scores, maintain benchmarks, process payments, prevent abuse, and communicate with you about your account. Aggregated, de-identified statistics may be used for public benchmark dashboards and research.',
  },
  {
    h: '3. Verification Content and Warrants',
    p: 'Prompts and answers you submit may be processed by third-party AI model providers to generate independent assessments. Warrants and their source snapshots (URLs, content hashes, metadata) are retained as attestations so provenance remains verifiable over time. Source snapshots are capped in size and capture only publicly fetched content at attestation time.',
  },
  {
    h: '4. Third-Party Services',
    p: 'We rely on: (a) Stripe for payments; (b) AI model providers (e.g., via OpenRouter) to run tribunal reasoning; (c) analytics and hosting providers. Each operates under its own privacy terms. We do not sell your personal data.',
  },
  {
    h: '5. Data Retention',
    p: 'We retain account and usage data for as long as your account is active. Warrant and audit data is retained to preserve verifiable provenance. You may request deletion of your account and associated data, subject to legal retention obligations and the need to preserve warrant integrity.',
  },
  {
    h: '6. Security',
    p: 'We use reasonable administrative, technical, and physical safeguards. API keys are treated as credentials. However, no system is perfectly secure, and we cannot guarantee absolute security. Trust scores reflect source and model state, not a guarantee of correctness.',
  },
  {
    h: '7. Cookies and Tracking',
    p: 'We use essential cookies for authentication and session management, and may use analytics cookies. You can control cookies through your browser settings; disabling some may affect functionality.',
  },
  {
    h: '8. Your Rights',
    p: 'Depending on your jurisdiction, you may have rights to access, correct, export, or delete your personal data, and to object to or restrict certain processing. To exercise these rights, contact us via the Contact page.',
  },
  {
    h: '9. Children\'s Privacy',
    p: 'The Service is not directed to children under 16, and we do not knowingly collect their personal data. If you believe a child has provided data, contact us for deletion.',
  },
  {
    h: '10. International Transfers',
    p: 'Your data may be processed in countries other than your own. Where applicable, we rely on appropriate safeguards for cross-border transfers.',
  },
  {
    h: '11. Changes to This Policy',
    p: 'We may update this Privacy Policy from time to time. Material changes will be posted with an updated "Last revised" date. Continued use after changes constitutes acceptance.',
  },
  {
    h: '12. Contact',
    p: 'Questions about privacy? Reach us through the Contact page.',
  },
];

export default function Privacy() {
  return (
    <div className="min-h-screen bg-background text-foreground pb-[env(safe-area-inset-bottom)]">
      <PublicNav />
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex items-center gap-2.5 mb-2">
          <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center">
            <Lock className="h-5 w-5 text-[#070A0F]" strokeWidth={2.5} />
          </div>
          <Link to="/" className="font-heading font-semibold text-foreground">Aether</Link>
        </div>
        <h1 className="font-heading text-3xl font-semibold text-foreground tracking-tight mt-4">Privacy Policy</h1>
        <p className="text-xs text-slate-500 mt-1.5">Last revised: August 1, 2026</p>

        <div className="mt-6 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.05] p-4 text-[13px] text-emerald-200/90">
          We do not sell your personal data. We use your data to run the trust layer — score answers, issue warrants, and keep benchmarks honest.
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
          <Link to="/terms" className="hover:text-slate-300">Terms of Service</Link>
          <Link to="/contact" className="hover:text-slate-300">Contact</Link>
          <Link to="/" className="hover:text-slate-300">Home</Link>
          <span className="ml-auto">Aether · The Truth Layer for AI · Don't trust. Verify.</span>
        </footer>
      </div>
    </div>
  );
}