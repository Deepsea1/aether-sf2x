import React from 'react';
import {
  Compass, Sparkles, Swords, ShieldCheck, Activity, Scale, FlaskConical,
  Crosshair, Gauge, KeyRound, ChevronRight, Check, AlertTriangle, GitBranch, BookOpen,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import AppShell from '@/components/sf2x/AppShell';

export default function Guide() {
  return (
    <AppShell>
      <div className="max-w-3xl">
        <div className="flex items-center gap-2 mb-1">
          <BookOpen className="h-5 w-5 text-emerald-400" />
          <h1 className="font-heading text-xl font-semibold text-white">Guide</h1>
        </div>
        <p className="text-sm text-slate-500 mb-8">Read this like an owner's manual. No jargon, just what to press and what you'll see.</p>

        <Callout>
          <strong className="text-slate-200">Start here.</strong> The whole app answers one question: <em>“Can I trust this AI answer?”</em> SF2X gives every answer a <span className="text-emerald-300">trust score (0–100)</span>, a <span className="text-emerald-300">warrant</span> (the reasons + sources), and a permanent <span className="text-emerald-300">lineage</span> trail. The buttons below let you produce, inspect, and stress-test those answers.
        </Callout>

        {/* Console */}
        <Section icon={<Sparkles className="h-4 w-4 text-emerald-400" />} title="Console  —  make a warranted answer" to="/console">
          <p>This is where you ask a question and get a warranted answer back.</p>
          <Steps items={[
            ['Type your question', 'In the big text box. e.g. “Is low-dose aspirin safe with warfarin?”'],
            ['Pick a Domain', 'Medicine, Finance, Legal, etc. — tells the engine what kind of stakes are involved.'],
            ['Pick Stakes', 'Low / Medium / High / Critical. Critical = highest scrutiny and may pull live web search.'],
            ['Pick a Model (optional)', 'Which AI to test. “Base44 (auto)” is the default.'],
            ['Press Think', 'The big green button (or Cmd/Ctrl + Enter). It reasons, writes a warrant, and scores itself.'],
            ['Read the result', 'You get: the answer, a Trustworthy Rate (0–100), the Warrant (premises, sources, confidence), and the Metrics.'],
            ['Press Revise', 'Creates a new version of the answer and logs a “correction event” comparing it to the old one.'],
          ]} />
        </Section>

        {/* Lineage */}
        <Section icon={<GitBranch className="h-4 w-4 text-emerald-400" />} title="Lineage  —  the paper trail" to="/lineage">
          <p>Shows the full history of any question: every answer version, its warrant, any corrections, and any debate.</p>
          <Steps items={[
            ['Pick an inquiry', 'Left list or explorer. Each branch is a saved artifact.'],
            ['Click a version', 'See that version’s answer, warrant, and trust score exactly as it was at that moment.'],
            ['Read the trail', 'Version 1 → 2 → 3… with correction events showing what changed and the trust delta.'],
          ]} />
        </Section>

        {/* Health */}
        <Section icon={<Activity className="h-4 w-4 text-emerald-400" />} title="Health  —  how honest is the system" to="/health">
          <p>Trend charts of epistemic performance over time — not “is it smart,” but “is it calibrated and self-correcting.”</p>
          <Steps items={[
            ['Read the trend', 'Trustworthy Rate over time should stay stable or rise. A drop = the engine is getting sloppier.'],
            ['Check capability mix', 'Pie chart of how many answers landed at each governance gate (L0–L4).'],
            ['Check correction speed', 'Mean Time To Correction (MTTC) — lower is better; it means mistakes get caught fast.'],
          ]} />
        </Section>

        {/* Governance */}
        <Section icon={<Scale className="h-4 w-4 text-emerald-400" />} title="Governance  —  human review" to="/governance">
          <p>Where flagged answers wait for a human decision. This is your “human in the loop.”</p>
          <Steps items={[
            ['See pending reviews', 'Answers that crossed a gate (e.g. critical-stakes or low trust) appear here.'],
            ['Approve / Reject', 'Open a review and choose. Approving promotes the answer; Rejecting suppresses it.'],
            ['Audit trail', 'Every decision is logged permanently below for accountability.'],
          ]} />
        </Section>

        {/* Collective — the debate */}
        <Section icon={<Swords className="h-4 w-4 text-emerald-400" />} title="Collective  —  trigger a debate (Tribunal)" to="/collective">
          <p>Three AI agents argue about one answer: a <span className="text-emerald-300">Proposer</span> (defends it), a <span className="text-amber-300">Critic</span> (attacks it), and a <span className="text-sky-300">Verifier</span> (rules). Plus a red-team that tries to break it.</p>
          <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.04] p-4 my-4">
            <div className="text-xs uppercase tracking-wider text-emerald-300 mb-2">Step-by-step: run a debate</div>
            <Steps items={[
              ['Go to Collective', 'It lists your recent inquiries automatically.'],
              ['Pick the Target inquiry', 'Use the dropdown to choose which question you want scrutinized. It loads the latest answer version + warrant.'],
              ['Press “Run Tribunal”', 'The green button. Three agents deliberate (Proposer defends, Critic objects, Verifier adjudicates). Takes a few seconds.'],
              ['Read the verdict', 'A panel shows each agent’s stance + the Verifier’s verdict: agreed / contested / rejected, plus a confidence %.'],
              ['(Optional) Red-team it', 'Pick an attack vector from the dropdown (e.g. prompt_injection) and press “Run Attack” to simulate someone trying to break the answer.'],
              ['Read the Red-Team Log', 'Each attack is logged: outcome = resisted / wobbled / broken, plus severity.'],
            ]} />
          </div>
          <p className="text-xs text-slate-500">Tip: debates only work on answers that already exist — make one in the Console first.</p>
        </Section>

        {/* Bench */}
        <Section icon={<FlaskConical className="h-4 w-4 text-emerald-400" />} title="Bench  —  compare models" to="/bench">
          <p>Side-by-side stress test: one prompt sent to several AIs at once.</p>
          <Steps items={[
            ['Type a prompt', 'Same question for all models.'],
            ['Tick the models', 'Pick which AIs to compare (Base44, Claude, Gemini web-search, GPT-5.4, etc.).'],
            ['Press Run comparison', 'Each model answers; results are sorted by trust score. The highest-trust answer is crowned.'],
            ['Read the metrics', 'Each card shows trust, warrant confidence, validity, calibration error, drift, correction rate.'],
          ]} />
        </Section>

        {/* Systems / Trust Center / Portal */}
        <Section icon={<ShieldCheck className="h-4 w-4 text-emerald-400" />} title="Systems & Trust Center" to="/systems">
          <p><strong>Systems</strong> = register the AI deployments you govern and sign off their release gates. <strong>Trust Center</strong> = a public summary of your safety guarantees and incident record.</p>
        </Section>

        <Section icon={<KeyRound className="h-4 w-4 text-emerald-400" />} title="Portal  —  your customer account" to="/portal">
          <p>Where a customer sees their subscription, generates their API key, watches usage vs. quota, and cancels.</p>
          <Steps items={[
            ['Generate key', 'Creates a secret API key (sk_sf2x_…) to use with the /inquire API.'],
            ['Copy it', 'Use it in the x-api-key header when calling the API.'],
            ['Watch usage', 'Progress bar of inquiries used this month vs. your plan limit.'],
            ['Cancel', 'Cancels the Stripe subscription (access continues until period end).'],
          ]} />
        </Section>

        {/* How to interpret trust */}
        <div className="mt-10">
          <div className="flex items-center gap-2 mb-4">
            <Gauge className="h-4 w-4 text-emerald-400" />
            <h2 className="text-sm font-medium text-slate-200">How to interpret the trust results</h2>
          </div>

          <Card>
            <div className="text-xs uppercase tracking-wider text-emerald-300 mb-2">Trustworthy Rate (0–100)</div>
            <p className="text-sm text-slate-400 mb-3">The headline number. It is <em>not</em> the AI’s confidence — it is a discipline score: how well-calibrated, self-correcting, and warranted the answer is.</p>
            <div className="space-y-2">
              <Bar color="bg-emerald-400" label="80–100" desc="High trust. Well-calibrated, low drift, valid warrant. Safe to act on." />
              <Bar color="bg-amber-400" label="60–79" desc="Moderate. Usable, but double-check premises and sources before high-stakes use." />
              <Bar color="bg-rose-400" label="Below 60" desc="Low trust. Treat cautiously — likely weak/invalid warrant, high drift, or poor calibration. Triggers governance review at critical stakes." />
            </div>
          </Card>

          <Card>
            <div className="text-xs uppercase tracking-wider text-emerald-300 mb-2">Warrant validity</div>
            <ul className="space-y-2 text-sm text-slate-400">
              <li><Pill color="text-emerald-300">valid</Pill> Premises hold and support the conclusion. No penalty.</li>
              <li><Pill color="text-amber-300">weak</Pill> Premises are uncertain. Trust docked ~10 pts. Scrutinize the premises.</li>
              <li><Pill color="text-rose-300">invalid</Pill> Premises don’t support the conclusion. Trust docked ~35 pts. Don’t act on it.</li>
              <li><Pill color="text-slate-300">expired</Pill> Premises are stale and need revalidation. Trust docked ~25 pts.</li>
            </ul>
          </Card>

          <Card>
            <div className="text-xs uppercase tracking-wider text-emerald-300 mb-2">The metrics (lower is worse for the first four)</div>
            <ul className="space-y-2 text-sm text-slate-400">
              <li><Mono>expected_calibration_error</Mono> — how far the AI’s stated confidence is from reality. Lower = more honest.</li>
              <li><Mono>uncorrected_confidence_rate</Mono> — confidence that was never checked/corrected. Lower = more disciplined.</li>
              <li><Mono>false_refusal_rate</Mono> — how often it refused answerable questions. Lower = less over-cautious.</li>
              <li><Mono>epistemic_drift_score</Mono> — how much the reasoning shifted between versions. Lower = more stable.</li>
              <li><Mono>correction_rate</Mono> — how often errors get caught and fixed. Higher = healthier (adds points).</li>
              <li><Mono>mean_time_to_correction</Mono> — seconds to catch a mistake. Lower = better.</li>
            </ul>
          </Card>

          <Card>
            <div className="text-xs uppercase tracking-wider text-emerald-300 mb-2">Debate verdict (Tribunal)</div>
            <ul className="space-y-2 text-sm text-slate-400">
              <li><Pill color="text-emerald-300">agreed</Pill> Proposer, Critic, and Verifier aligned. Strongest signal.</li>
              <li><Pill color="text-amber-300">contested</Pill> Disagreement remains. Read the Critic’s objections and the minority report.</li>
              <li><Pill color="text-rose-300">rejected</Pill> Verifier overruled the answer. Do not ship it; revise or suppress.</li>
            </ul>
            <p className="text-xs text-slate-500 mt-3">The Verifier’s <span className="text-slate-300">verdict_confidence</span> (0–1) is how sure the referee is. Above ~0.7 is a firm ruling.</p>
          </Card>

          <Card>
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-emerald-300 mb-2"><AlertTriangle className="h-3.5 w-3.5" /> Red-team outcome</div>
            <ul className="space-y-2 text-sm text-slate-400">
              <li><Pill color="text-emerald-300">resisted</Pill> The answer held up under attack.</li>
              <li><Pill color="text-amber-300">wobbled</Pill> It bent but didn’t break — investigate the severity.</li>
              <li><Pill color="text-rose-300">broken</Pill> The attack succeeded. Fix or suppress the answer.</li>
            </ul>
          </Card>
        </div>

        <div className="mt-10">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            <h2 className="text-sm font-medium text-slate-200">Known limitations</h2>
          </div>
          <div className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.03] p-5 space-y-3 text-sm text-slate-400">
            <p>• The verifier is itself an LLM. It can be wrong, be fooled, or lack access to non-public knowledge. The tribunal's <span className="text-slate-200">cross-firm verifier ensemble</span> reduces single-model blind spots (failure shifts to "where independent labs converge") but does <em>not</em> escape the epistemic limits of its verifiers.</p>
            <p>• Live web context reflects the state and biases of the open web at fetch time; it is not authoritative. Source <span className="text-slate-200">corroboration</span> across independent AIs is evidence of grounding, not proof of truth.</p>
            <p>• Calibration thresholds are heuristic, tuned by domain, not derived from a peer-reviewed ground-truth set. The tribunal gives us the data to tune them empirically over time.</p>
            <p>• Source snapshots capture the first ~200KB of a page; paywalled, JS-rendered, or removed content may hash to little or nothing. (Not addressed by the tribunal — a separate engineering item.)</p>
            <p>• SF2X has published both its benchmark correlation (Audit #1) and its tribunal-vs-single-model lift (Audit #2) against a representative TruthfulQA / HaluEval sample but has <span className="text-amber-200">not</span> undergone an independent third-party audit. We commit to the remaining roadmap item.</p>
            <p className="text-[12px] text-slate-500 pt-2 border-t border-amber-400/10">For the full methodology, audit results, and open validation protocol, see <Link to="/methodology" className="text-emerald-300 hover:text-emerald-200 underline-offset-2 hover:underline">Methodology &amp; Limitations</Link>.</p>
          </div>
        </div>

        <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.02] p-5 text-sm text-slate-400">
          <div className="flex items-center gap-2 mb-2"><Compass className="h-4 w-4 text-emerald-400" /><span className="text-slate-200 font-medium">The 3-minute daily flow</span></div>
          <ol className="list-decimal list-inside space-y-1.5 text-slate-400">
            <li>Console → ask your real question → press <span className="text-emerald-300">Think</span>.</li>
            <li>Glance at the Trustworthy Rate. If under 80, read the Warrant premises.</li>
            <li>Collective → <span className="text-emerald-300">Run Tribunal</span> on anything high-stakes.</li>
            <li>If the verdict is “contested” or “rejected,” press <span className="text-emerald-300">Revise</span> back in Console.</li>
            <li>Health → check the trend isn’t dropping.</li>
          </ol>
        </div>

        <footer className="mt-10 pt-6 border-t border-white/5 text-[11px] text-slate-600">SF2X · Epistemic Operating System · Guide</footer>
      </div>
    </AppShell>
  );
}

function Callout({ children }) {
  return <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.04] p-5 text-sm text-slate-300 mb-8">{children}</div>;
}

function Section({ icon, title, to, children }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5 mb-4">
      <Link to={to} className="flex items-center gap-2 mb-3 group">
        {icon}
        <h2 className="text-sm font-medium text-slate-200 group-hover:text-white">{title}</h2>
        <ChevronRight className="h-3.5 w-3.5 text-slate-600 ml-auto group-hover:text-slate-400" />
      </Link>
      <div className="text-sm text-slate-400 space-y-1">{children}</div>
    </div>
  );
}

function Steps({ items }) {
  return (
    <ol className="mt-2 space-y-2">
      {items.map(([k, v], i) => (
        <li key={i} className="flex gap-2.5 text-sm">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-400/10 text-[10px] font-medium text-emerald-300">{i + 1}</span>
          <span className="text-slate-300"><span className="font-medium text-slate-200">{k}.</span> <span className="text-slate-400">{v}</span></span>
        </li>
      ))}
    </ol>
  );
}

function Card({ children }) {
  return <div className="rounded-xl border border-white/10 bg-[#0B0F16] p-5 mb-4">{children}</div>;
}

function Bar({ color, label, desc }) {
  return (
    <div className="flex items-start gap-3">
      <span className={`mt-1 h-2 w-10 rounded-full ${color} shrink-0`} />
      <div>
        <span className="text-sm font-medium text-slate-200">{label}</span>
        <p className="text-xs text-slate-500">{desc}</p>
      </div>
    </div>
  );
}

function Pill({ color, children }) {
  return <span className={`inline-block text-[10px] font-mono uppercase tracking-wider mr-2 ${color}`}>{children}</span>;
}

function Mono({ children }) {
  return <code className="text-[11px] text-slate-300 font-mono">{children}</code>;
}