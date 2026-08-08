import React from 'react';
import { ShieldAlert, BookOpen, AlertTriangle, ExternalLink, Fingerprint, Handshake, FileSearch, Gauge } from 'lucide-react';
import AppShell from '@/components/sf2x/AppShell';
import CorrelationAuditCard from '@/components/sf2x/CorrelationAuditCard';
import TribunalLiftCard from '@/components/sf2x/TribunalLiftCard';
import CalibrationCard from '@/components/sf2x/CalibrationCard';
import { Link } from 'react-router-dom';

// Public Methodology & Limitations disclosure. SF2X is a trust/provenance layer,
// not a ground-truth oracle. This page discloses how it works, its known
// limitations, error rates context, and external benchmark references — and
// explicitly does NOT claim to be independently validated as "the best".
export default function Methodology() {
  return (
    <AppShell>
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-amber-400/80 mb-2">
            <BookOpen className="h-3.5 w-3.5" /> Methodology & Limitations
          </div>
          <h1 className="font-heading text-2xl font-semibold text-white">How SF2X works — and where it doesn't</h1>
          <p className="text-sm text-slate-400 mt-1.5">
            A trust layer that can't verify <em>itself</em> is just another vendor making claims. This page discloses our methodology, our known limitations, and the external benchmarks we cross-reference — honestly.
          </p>
        </div>

        {/* The honest claim */}
        <div className="rounded-2xl border border-amber-400/30 bg-amber-400/[0.04] p-5 mb-6">
          <div className="flex items-start gap-3">
            <ShieldAlert className="h-5 w-5 text-amber-300 shrink-0 mt-0.5" />
            <div className="text-sm text-slate-200 leading-relaxed">
              <span className="font-medium text-amber-200">SF2X does not claim to be "the best" AI truthfulness tool.</span> As of now, no single tool — SF2X included — is independently, peer-reviewedly established as best-in-class for checking AI honesty. That space (TruthfulQA, HaluEval, FactScore, red-teaming, fact-checking APIs) is active and contested. Any "best" claim, including ours, is vendor marketing until externally verified. We treat our own claims with the same skepticism we apply to the answers we attest. <span className="text-amber-100">For now, treat every claim on this site as promotional unless it is supported by concrete evidence: independently validated technical results, real adoption, and demonstrated reliability at scale.</span>
            </div>
          </div>
        </div>

        <Section title="What SF2X is — and isn't">
          <p><span className="text-slate-200 font-medium">Is:</span> a warrant & provenance layer. For any AI answer, SF2X decomposes claims, independently source-grounds them against live web context, computes a calibrated trust score, signs a cryptographic warrant, tracks lineage, and re-validates over time. The output is an <em>auditable decision record</em>, not a guarantee of truth.</p>
          <p className="mt-3"><span className="text-slate-200 font-medium">Is not:</span> a ground-truth oracle. It cannot know things the web doesn't contain. A high trust score means "claims are well-sourced and internally consistent <em>at attestation time</em>" — not "this is objectively correct."</p>
        </Section>

        <Section title="Methodology" icon={BookOpen}>
          <ol className="list-decimal list-inside space-y-1.5 text-slate-400">
            <li><span className="text-slate-200">Claim decomposition</span> — the answer is split into atomic factual claims.</li>
            <li><span className="text-slate-200">Independent verification</span> — each claim is checked against live web context (Gemini 3 Flash w/ search) and cited sources; a claim is "supported" only when backed by credible evidence.</li>
            <li><span className="text-slate-200">Calibration</span> — a per-domain trust score is derived from the support ratio and verifier confidence, then calibrated by domain sensitivity (medicine/finance/legal are stricter).</li>
            <li><span className="text-slate-200">Warrant signing</span> — premises, conclusion, confidence, validity, and sources are sealed with an HMAC-SHA256 signature verifiable by anyone holding the attestation key.</li>
            <li><span className="text-slate-200">Evidence preservation</span> — cited sources are fetched and content-hashed at attestation time, so the warrant stays grounded even if sources rot.</li>
            <li><span className="text-slate-200">Drift re-validation</span> — warrants have an expiry; the <code>revalidateWarrant</code> endpoint re-checks content against live sources to detect decay.</li>
          </ol>
        </Section>

        <Section title="Multi-model tribunal (hardened answers)" icon={BookOpen}>
          <p>For medium / high / critical stakes the Console runs a hardened 3-way tribunal instead of a single answer:</p>
          <ol className="list-decimal list-inside space-y-1.5 text-slate-400 mt-2">
            <li><span className="text-slate-200">Three independent AIs answer</span> the same prompt (default trio: Anthropic, Google, OpenAI — three separate labs).</li>
            <li><span className="text-slate-200">Cross-examination</span> — each answer is restated and pressure-tested by a critic from a <em>different</em> model family, so no model ever grades its own output.</li>
            <li><span className="text-slate-200">Reconciliation</span> — each original author revises in light of its critique (conceding or defending), producing an improved answer.</li>
            <li><span className="text-slate-200">Cross-firm merge</span> — an independent verifier from a lab that answered <em>none</em> of the candidates ranks the three initials for correctness and synthesizes one hardened answer inheriting the strongest premises and best-corroborated sources. For critical stakes a second verifier must agree, or the result is marked <em>contested</em>.</li>
            <li><span className="text-slate-200">Falsification role</span> — a blind falsifier (distinct from the red team) constructs the strongest case that the answer is FALSE, using fetched sources and general knowledge. A <em>strong</em> counter-case caps the verdict at <em>weak</em> regardless of support ratio; the argument is attached to the warrant verbatim.</li>
            <li><span className="text-slate-200">Honest abstention</span> — when ≥50% of claims are ungrounded after fetch, or a coverage check finds the available sources could not have detected a falsehood on the load-bearing claim, the tribunal returns <em>insufficient_evidence</em> instead of affirming. Support confidence and detectability confidence are tracked separately.</li>
            <li><span className="text-slate-200">Attestation</span> — the hardened answer is run through the standard web-grounded verification pipeline (validity, calibrated trust, source snapshots) and sealed with a signed warrant.</li>
            <li><span className="text-slate-200">Corroboration</span> — sources cited by 2+ of the three AIs are recorded on the warrant as triangulated evidence, not consensus-by-coincidence.</li>
            <li><span className="text-slate-200">No data lost</span> — every initial answer is logged to the public benchmark; critiques and reconciliations are preserved as debate records in the audit trail.</li>
          </ol>
          <p className="mt-3 text-[12px] text-slate-500">Low-stakes questions skip the tribunal and use a single model to stay cheap.</p>
        </Section>

        <Section title="Known limitations" icon={AlertTriangle}>
          <ul className="space-y-2 text-slate-400">
            <li>• Verified by a multi-role LLM tribunal (proposer, critic, verifier, falsifier) plus an adversarial red-team pass. All roles are language models and may share correlated blind spots from overlapping training data — agreement between them is <em>not</em> independent confirmation. Most runs are <em>not</em> cross-firm verified (the foreign-vendor falsifier is cost-gated and runs only on high/critical stakes). Treat any single score as a vendor claim.</li>
            <li>• The verifier is itself an LLM. It can be wrong, be fooled, or lack access to non-public knowledge. The tribunal's <span className="text-slate-200">cross-firm verifier ensemble</span> reduces single-model blind spots (failure shifts to "where independent labs converge") but does <em>not</em> escape the epistemic limits of its verifiers. A foreign-vendor falsifier (Gate 3) adds one decorrelated role; it is cost-gated and runs only on high/critical stakes, so most runs are <em>not</em> cross-firm.</li>
            <li>• Live web context reflects the state and biases of the open web at fetch time; it is not authoritative. Source <span className="text-slate-200">corroboration</span> across independent AIs is evidence of grounding, not proof of truth.</li>
            <li>• Calibration thresholds are heuristic, tuned by domain, not derived from a peer-reviewed ground-truth set. The tribunal gives us the data to tune them empirically over time.</li>
            <li>• Source snapshots capture the first ~200KB of a page; paywalled, JS-rendered, or removed content may hash to little or nothing. (Not addressed by the tribunal — a separate engineering item.)</li>
            <li>• SF2X has published both its benchmark correlation (Audit #1) and its tribunal-vs-single-model lift (Audit #2) against a representative TruthfulQA / HaluEval sample (see below) but has <span className="text-amber-200">not</span> undergone an independent third-party audit. We commit to the remaining roadmap item.</li>
          </ul>
        </Section>

        <Section title="Audit roadmap — running audits on ourselves" icon={Fingerprint}>
          <p className="text-slate-400">A trust layer that never submits to external scrutiny is just a vendor. SF2X commits to at least two independent audits of its own pipeline, and will publish the results here regardless of outcome:</p>
          <ol className="list-decimal list-inside space-y-2 text-slate-400 mt-3">
            <li><span className="text-slate-200">Benchmark correlation</span> — run the full SF2X pipeline (single + tribunal) against TruthfulQA, HaluEval, and FactScore and publish formal correlation: does a high SF2X trust score actually predict lower hallucination / higher factual precision on these public datasets? We will publish both the numbers and the failures.</li>
            <li><span className="text-slate-200">Tribunal vs. single-model lift</span> — measure whether the 3-way hardened answer measurably beats the best single model on those same datasets (a clean, falsifiable claim). If it does not, we say so.</li>
            <li><span className="text-slate-200">Independent third-party audit</span> — commission an external audit firm to review the warrant pipeline, signing, source preservation, and calibration logic, and publish their findings.</li>
          </ol>

          <div className="mt-4">
            <div className="text-[11px] uppercase tracking-[0.14em] text-emerald-300/80 mb-2">Audit #1 · status: published</div>
            <CorrelationAuditCard />
          </div>

          <div className="mt-4">
            <div className="text-[11px] uppercase tracking-[0.14em] text-amber-300/80 mb-2">Audit #2 · status: published</div>
            <TribunalLiftCard />
          </div>

          <p className="text-[12px] text-slate-500 mt-3">Audit #3 (independent third-party audit) remains a commitment. Until it is complete, treat every SF2X score — including tribunal-hardened ones — as a vendor claim and pressure-test it against the benchmarks below.</p>
        </Section>

        <Section title="Published calibration (Gate 4)" icon={Gauge}>
          <p className="text-slate-400">A trust score is only as honest as its calibration curve. SF2X runs its full versioned corpus through the real pipeline and publishes Brier score, per-confidence-bucket accuracy, and catch rates per class here — auto-updated, regardless of outcome.</p>
          <div className="mt-4">
            <CalibrationCard />
          </div>
          <p className="text-[12px] text-slate-500 mt-3">
            CI rule: a deploy that regresses FABRICATED catch rate by &gt;10% or Brier by &gt;0.05 blocks release. A confidence bucket whose empirical accuracy falls below 65% is <span className="text-rose-300">suppressed</span> — we show the verdict band only, never a numeric confidence the eval set has falsified. Corpus ground truth is versioned and never edited after a run scores against it; v2 is an AI-authored draft pending human lock, disclosed honestly in each published report.
          </p>
        </Section>

        <Section title="Open audit protocol — how any third party can validate us now" icon={FileSearch}>
          <p className="text-slate-400">We cannot audit ourselves, and we will not ask you to take our word. While Audit #3 is pending, we publish an open protocol so any neutral party — academic lab, auditor, regulator — can independently reproduce or falsify our claims <em>today</em>, without waiting for us:</p>
          <ol className="list-decimal list-inside space-y-2 text-slate-400 mt-3">
            <li><span className="text-slate-200">Verify any warrant</span> — every signed attestation is published to the <Link to="/registry" className="text-emerald-300 underline-offset-2 hover:underline">Warrant Registry</Link> at <code>/verify/&lt;lineage_id&gt;</code>. The HMAC-SHA256 signature is recomputable by anyone holding the attestation key; the API endpoint returns <code>signature_valid</code> against the stored content hash, so tampering is detectable without trusting us.</li>
            <li><span className="text-slate-200">Reproduce the correlation audit</span> — <code>runCorrelationAudit</code> runs the full SF2X pipeline against a representative TruthfulQA / HaluEval sample and publishes Pearson, Spearman, ROC-AUC, and mean-trust separation. We will hand any auditor the exact question set, verifier model, and seed on request so the numbers are reproducible, not cherry-picked.</li>
            <li><span className="text-slate-200">Reproduce the tribunal lift</span> — <code>runTribunalLiftAudit</code> compares single-model vs. 3-way tribunal correctness on adversarial questions with known correct answers. The published per-item table (question, correct answer, single vs. tribunal correctness) is falsifiable: an auditor can re-run with their own ground-truth labels and check for cherry-picking.</li>
            <li><span className="text-slate-200">Inspect source preservation</span> — each warrant stores a SHA-256 content hash + metadata of every cited source at attestation time, so an auditor can confirm the warrant was grounded in what the source actually said then, not what it says now.</li>
          </ol>
          <p className="text-[12px] text-slate-500 mt-3">This is not a substitute for an independent audit — it is the mechanism that makes one possible. If you are an auditor, academic, or regulator and want to run Audit #3, <Link to="/contact" className="text-emerald-300 underline-offset-2 hover:underline">contact us</Link> and we will provide the keys, the question sets, and compute credits to reproduce every number on this page.</p>
        </Section>

        <Section title="Deployments & design partners" icon={Handshake}>
          <p className="text-slate-400">An enterprise trust product with zero named deployments is a demo with great methodology. We will not fabricate case studies — that would be the exact vendor-claim this product exists to eliminate. Here is the honest state:</p>
          <ul className="space-y-2 text-slate-400 mt-3">
            <li>• <span className="text-slate-200">Named public deployments:</span> 0. We have not yet wrapped a named enterprise's LLM and published the before/after hallucination rate. We will not pretend otherwise.</li>
            <li>• <span className="text-slate-200">What we have:</span> a published, falsifiable methodology, an open audit protocol above, and a hard-question lift audit showing the tribunal catches confabulations single models miss.</li>
            <li>• <span className="text-slate-200">What we need:</span> 2 named design partners willing to publish "we wrapped X's clinical Q&amp;A, hallucination incidents fell Y%." That single number is worth more than every dashboard on this site. If you run a high-stakes AI deployment, <Link to="/contact" className="text-emerald-300 underline-offset-2 hover:underline">become a design partner</Link> and we will publish the result regardless of outcome.</li>
          </ul>
        </Section>

        <Section title="How to read a trust score">
          <div className="grid sm:grid-cols-3 gap-3 text-sm">
            <Score tone="emerald" label="valid" range="≥ domain valid threshold" desc="Claims well-supported by evidence." />
            <Score tone="amber" label="weak" range="mixed support" desc="Some claims unsupported or thin evidence." />
            <Score tone="rose" label="invalid" range="unsupported / fabricated" desc="Claims contradicted or unevidenced." />
          </div>
          <p className="text-[12px] text-slate-500 mt-3">Trust scores are 0–100, domain-calibrated. Medicine/finance/legal apply stricter thresholds than general knowledge. A score is a snapshot, not a warranty.</p>
        </Section>

        <Section title="External benchmarks to cross-check against">
          <p className="text-slate-400">We encourage independent evaluation of SF2X against the established factuality / hallucination literature. We do not claim SF2X outperforms these — we cite them so you can check:</p>
          <ul className="mt-3 space-y-2 text-sm">
            <ExtLink href="https://arxiv.org/abs/2109.07958" title="TruthfulQA" desc="Benchmark measuring whether models imitate false beliefs / misconceptions." />
            <ExtLink href="https://arxiv.org/abs/2305.11747" title="HaluEval" desc="Hallucination evaluation across generated and annotated examples." />
            <ExtLink href="https://arxiv.org/abs/2305.13551" title="FactScore" desc="Fine-grained atomic evaluation of factual precision in long-form generation." />
            <ExtLink href="https://arxiv.org/abs/2204.05862" title="HELM" desc="Holistic Evaluation of Language Models — multi-metric, multi-task." />
          </ul>
        </Section>

        <Section title="Verify us yourself" icon={Fingerprint}>
          <p className="text-slate-400">Every warrant SF2X signs is published to a tamper-evident transparency log. You can independently verify any signature and inspect the preserved evidence.</p>
          <Link to="/registry" className="mt-3 inline-flex items-center gap-1.5 text-sm text-emerald-300 hover:text-emerald-200">
            <Fingerprint className="h-4 w-4" /> Open the Warrant Registry →
          </Link>
        </Section>

        <p className="text-[11px] text-slate-600 mt-8 leading-relaxed">
          This disclosure is part of the product, not a footnote. If SF2X ever claims to be "the best" without external validation, treat it the way this page tells you to treat any such claim: with skepticism.
        </p>
      </div>
    </AppShell>
  );
}

function Section({ title, icon: Icon, children }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5 mb-4">
      <div className="flex items-center gap-2 mb-3">
        {Icon && <Icon className="h-4 w-4 text-slate-400" />}
        <h2 className="text-sm font-semibold text-white">{title}</h2>
      </div>
      <div className="text-sm text-slate-400 leading-relaxed">{children}</div>
    </div>
  );
}

function Score({ tone, label, range, desc }) {
  const c = tone === 'emerald' ? 'border-emerald-400/30 text-emerald-300' : tone === 'amber' ? 'border-amber-400/30 text-amber-300' : 'border-rose-400/30 text-rose-300';
  return (
    <div className={`rounded-xl border ${c} bg-white/[0.02] p-3`}>
      <div className="font-mono text-sm">{label}</div>
      <div className="text-[11px] text-slate-500 mt-0.5">{range}</div>
      <div className="text-[12px] text-slate-400 mt-1.5">{desc}</div>
    </div>
  );
}

function ExtLink({ href, title, desc }) {
  return (
    <li>
      <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-slate-200 hover:text-emerald-300">
        {title} <ExternalLink className="h-3 w-3" />
      </a>
      <span className="text-slate-500"> — {desc}</span>
    </li>
  );
}