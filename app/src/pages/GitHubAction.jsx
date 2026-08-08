import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, Github, Copy, Check, Terminal, ArrowRight, GitBranch } from 'lucide-react';
import PublicNav from '@/components/sf2x/PublicNav';

const WORKFLOW = `name: Aether — verify AI outputs

on:
  pull_request:
    paths: ['src/ai-outputs/**']
  workflow_dispatch:
    inputs:
      text:
        description: 'AI output text to verify'
        required: true

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Verify with Aether
        uses: aether-sf2x/verify-action@v1
        with:
          api-key: \${{ secrets.AETHER_API_KEY }}
          text: \${{ github.event.inputs.text || 'Your AI output text' }}
          # Optional: fail the build if trust drops below this threshold
          min-trust: 60

      - name: Upload warrant
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: aether-warrant
          path: aether-result.json`;

const SETUP = `# Add your Aether API key as a repository secret
gh secret set AETHER_API_KEY --body "sk_sf2x_..."

# Then commit the workflow file above to .github/workflows/aether.yml`;

export default function GitHubAction() {
  const [copied, setCopied] = useState(null);
  function copy(text, id) { navigator.clipboard?.writeText(text); setCopied(id); setTimeout(() => setCopied(null), 1600); }

  return (
    <div className="min-h-screen bg-background text-foreground pb-[env(safe-area-inset-bottom)]">
      <PublicNav />
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-10">
        <header className="flex items-center justify-between mb-8">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center">
              <ShieldCheck className="h-4 w-4 text-[#070A0F]" strokeWidth={2.5} />
            </div>
            <span className="font-heading font-semibold text-foreground">Aether</span>
          </Link>
          <a href="https://github.com/marketplace?type=actions&query=aether" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 h-9 text-xs text-foreground hover:bg-white/5"><Github className="h-3.5 w-3.5" /> Marketplace</a>
        </header>

        <div className="mb-8">
          <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-emerald-400/80 mb-2"><GitBranch className="h-3.5 w-3.5" /> GitHub Action</div>
          <h1 className="font-heading text-2xl sm:text-3xl font-semibold text-foreground tracking-tight">Verify AI outputs in your CI pipeline.</h1>
          <p className="text-sm text-slate-400 mt-2 max-w-2xl leading-relaxed">Add the Aether GitHub Action to your repo and every AI-generated output committed to a pull request is automatically verified, trust-scored, and warrant-backed. Fail the build when trust drops below your threshold.</p>
        </div>

        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.04] p-4 mb-6 flex items-start gap-3">
          <Terminal className="h-5 w-5 text-emerald-400 mt-0.5 shrink-0" />
          <div className="text-sm text-slate-300">Install in minutes. Add the workflow file below, store your <code className="text-slate-200">AETHER_API_KEY</code> as a repository secret, and every PR is verified.</div>
        </div>

        <div className="space-y-6">
          <Snippet title=".github/workflows/aether.yml" code={WORKFLOW} id="wf" copied={copied} onCopy={copy} />
          <Snippet title="Setup — add your secret" code={SETUP} id="setup" copied={copied} onCopy={copy} />

          <div className="rounded-2xl border border-white/10 bg-card p-5">
            <h2 className="text-sm font-medium text-foreground mb-3">What it does</h2>
            <ul className="space-y-2 text-[13px] text-slate-400">
              <li className="flex gap-2"><Check className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" /> Runs the proposer–critic–verifier tribunal on the AI output.</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" /> Writes a signed warrant artifact with the trust score.</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" /> Fails the build when trust falls below <code className="text-slate-200">min-trust</code>.</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" /> Posts the verdict as a PR comment (optional).</li>
            </ul>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <a href="https://github.com/marketplace?type=actions&query=aether" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 px-5 h-11 text-sm font-medium text-[#070A0F] hover:opacity-90"><Github className="h-4 w-4" /> Install from Marketplace <ArrowRight className="h-4 w-4" /></a>
            <Link to="/api-docs" className="text-xs text-slate-400 hover:text-slate-200">Read the API docs →</Link>
          </div>
        </div>

        <footer className="mt-12 pt-6 border-t border-white/5 text-[11px] text-slate-600">Aether · The Truth Layer for AI · Don't trust. Verify.</footer>
      </div>
    </div>
  );
}

function Snippet({ title, code, id, copied, onCopy }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/5">
        <span className="text-[11px] font-mono text-slate-400">{title}</span>
        <button onClick={() => onCopy(code, id)} className="text-slate-400 hover:text-white inline-flex items-center gap-1.5 text-[11px]">{copied === id ? <><Check className="h-3.5 w-3.5 text-emerald-300" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy</>}</button>
      </div>
      <pre className="text-[12px] font-mono text-slate-300 p-4 overflow-x-auto whitespace-pre">{code}</pre>
    </div>
  );
}