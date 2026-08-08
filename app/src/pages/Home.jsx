import React, { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Crown, Link2, Loader2, RefreshCw, ShieldCheck, Swords } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import AppShell from '@/components/sf2x/AppShell';
import PromptConsole from '@/components/sf2x/PromptConsole';
import AnswerCard from '@/components/sf2x/AnswerCard';
import WarrantCard from '@/components/sf2x/WarrantCard';
import MetricsGrid from '@/components/sf2x/MetricsGrid';
import InquiryHistory from '@/components/sf2x/InquiryHistory';
import LineageTimeline from '@/components/sf2x/LineageTimeline';
import TrustScoreHeader from '@/components/sf2x/TrustScoreHeader';
import TrustExplainer from '@/components/sf2x/TrustExplainer';
import VerifiedTag from '@/components/sf2x/VerifiedTag';
import { buildThinkPrompt, THINK_JSON_SCHEMA, generateSignature, computeTrustworthyRate } from '@/lib/sf2x';
import { computeDrift, correctionSeverity, driftLabel } from '@/lib/sf2xGovernance';
import { gateDecision } from '@/lib/sf2xPolicy';
import ReviewBanner from '@/components/sf2x/ReviewBanner';
import RankedAnswers from '@/components/sf2x/RankedAnswers';
import WhyTrustTour from '@/components/sf2x/WhyTrustTour';
import WhatWouldChange from '@/components/sf2x/WhatWouldChange';
import ChallengePanel from '@/components/sf2x/ChallengePanel';
import TribunalTrace from '@/components/sf2x/TribunalTrace';
import { ALL_MODELS } from '@/lib/sf2xBench';
import { DEFAULT_TRIO } from '@/lib/sf2xCompanies';

// Default multi-model panel for the Console — the selected model is always included (deduped).
const PANEL_MODELS = ['automatic', 'claude_opus_4_8', 'gemini_3_flash', 'gpt_5_mini'];
const MODEL_META = Object.fromEntries(ALL_MODELS.map((m) => [m.value, m]));

export function ConsoleContent() {
  const [prompt, setPrompt] = useState('');
  const [domain, setDomain] = useState('General');
  const [stakes, setStakes] = useState('high');
  const [model, setModel] = useState('automatic');
  const [tribunalModels, setTribunalModels] = useState([...DEFAULT_TRIO]);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState(null);
  const [active, setActive] = useState(null);
  const [explained, setExplained] = useState(true);
  const [inquiries, setInquiries] = useState([]);
  const [copied, setCopied] = useState(false);
  const [whyOpen, setWhyOpen] = useState(false);
  const [challengeOpen, setChallengeOpen] = useState(false);

  const loadHistory = useCallback(async () => {
    try {
      const list = await base44.entities.Inquiry.list('-created_date', 30);
      setInquiries(list);
    } catch {
      /* history load is best-effort */
    }
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  async function applyGate(inq, av, version, metrics, warrant) {
    const gate = gateDecision(inq.stakes_level, metrics, warrant);
    let review = null;
    if (gate.createReview) {
      review = await base44.entities.Review.create({
        answer_version_id: av.id,
        inquiry_id: inq.id,
        capability_level: gate.cap.key,
        status: gate.killSwitch ? 'killed' : 'pending',
      }).catch(() => null);
      await base44.entities.AuditLog.create({
        event_type: gate.killSwitch ? 'kill_switch' : 'gate_decision',
        entity_type: 'AnswerVersion',
        entity_id: av.id,
        summary: gate.killSwitch
          ? `Answer v${version} suppressed (kill-switch) at ${gate.cap.key} · trust ${gate.trust}`
          : `Answer v${version} routed to human review at ${gate.cap.key} · trust ${gate.trust}`,
        metadata: { capability: gate.cap.key, trust: gate.trust, review_id: review?.id },
      }).catch(() => {});
      if (gate.killSwitch) {
        await base44.entities.Inquiry.update(inq.id, { status: 'review' }).catch(() => {});
      }
    }
    return { gate, review };
  }

  async function runModel(m, p, d, s) {
    const params = { prompt: buildThinkPrompt(p, d, s), response_json_schema: THINK_JSON_SCHEMA };
    if (m !== 'automatic') params.model = m;
    if (s === 'critical' && (m === 'automatic' || m === 'gemini_3_flash' || m === 'gemini_3_1_pro')) {
      params.add_context_from_internet = true;
      if (m === 'automatic') params.model = 'gemini_3_flash';
    }
    const res = await base44.integrations.Core.InvokeLLM(params);
    const r = res && res.data ? res.data : res;
    const w = r.warrant || {};
    const meta = MODEL_META[m] || { label: m, tag: '' };
    return {
      model: m, label: meta.label, tag: meta.tag,
      answer: r.answer || '', warrant: w, metrics: r.metrics || {},
      cognitive_state: r.cognitive_state || {}, trust: computeTrustworthyRate(r.metrics || {}, w), raw: r,
    };
  }

  async function handleThink() {
    if (!prompt.trim() || thinking) return;
    setThinking(true);
    setError(null);
    try {
      // The Console now runs the hardened 3-way tribunal backend: three AIs answer,
      // cross-examine each other, reconcile, and a cross-firm verifier merges one
      // hardened warranted answer. All three initial answers are logged to the
      // benchmark so no model call is lost. Low stakes fall back to a single model.
      const res = await base44.functions.invoke('inquireTribunal', {
        prompt: prompt.trim(),
        domain,
        stakes,
        model: model || 'automatic',
        models: stakes === 'low' ? undefined : tribunalModels,
      });
      const data = res?.data || res;
      if (data?.error) { setError(data.error); return; }

      const inquiry = data.inquiry;
      const version = data.version;
      const warrant = data.warrant;
      const fullVersion = { ...version, warrant_id: warrant.id };

      const { gate, review } = await applyGate(inquiry, version, version.version, version.metrics, warrant);
      await base44.entities.AuditLog.create({
        event_type: 'answer_promoted',
        entity_type: 'AnswerVersion',
        entity_id: version.id,
        summary: `Answer v${version.version} ${gate.killSwitch ? 'generated' : 'promoted'} at ${gate.cap.key} (${gate.cap.label}) · trust ${gate.trust} · ${data.tribunal?.mode === 'tribunal' ? 'tribunal ' + (data.tribunal.trio || []).join('+') : 'single ' + (data.tribunal?.model || '')}`,
        metadata: { capability: gate.cap.key, trust: gate.trust, stakes, mode: data.tribunal?.mode, trio: data.tribunal?.trio, consensus: data.tribunal?.consensus, corroboration: data.tribunal?.corroboration?.count },
      }).catch(() => {});
      setActive({ inquiry, version: fullVersion, warrant, versions: [fullVersion], corrections: [], correction: null, reviews: review ? [review] : [], review, panel: data.candidates || [], tribunal: data.tribunal || null });
      await loadHistory();
    } catch (e) {
      setError(e?.message || 'The tribunal failed to produce a hardened answer.');
    } finally {
      setThinking(false);
    }
  }

  async function reviseInquiry() {
    if (!active?.inquiry || thinking) return;
    const inq = active.inquiry;
    setThinking(true);
    setError(null);
    try {
      const priorVersions = await base44.entities.AnswerVersion.filter({ inquiry_id: inq.id }, 'version', 50);
      const existingCorrections = await base44.entities.CorrectionEvent.filter({ inquiry_id: inq.id }, '-created_date', 50);
      const prev = priorVersions[priorVersions.length - 1];
      let prevWarrant = null;
      if (prev?.warrant_id) prevWarrant = await base44.entities.Warrant.get(prev.warrant_id).catch(() => null);

      const llmParams = { prompt: buildThinkPrompt(inq.prompt, inq.domain, inq.stakes_level), response_json_schema: THINK_JSON_SCHEMA };
      const chosen = model || 'automatic';
      if (chosen !== 'automatic') llmParams.model = chosen;
      if (inq.stakes_level === 'critical') {
        const supportsWeb = chosen === 'automatic' || chosen === 'gemini_3_flash' || chosen === 'gemini_3_1_pro';
        if (supportsWeb) {
          llmParams.add_context_from_internet = true;
          if (chosen === 'automatic') llmParams.model = 'gemini_3_flash';
        }
      }
      const res = await base44.integrations.Core.InvokeLLM(llmParams);
      const r = res && res.data ? res.data : res;

      const version = (prev ? prev.version : 0) + 1;
      const w = r.warrant || {};
      const av = await base44.entities.AnswerVersion.create({
        inquiry_id: inq.id, version,
        answer_text: r.answer || '',
        cognitive_state: { ...(r.cognitive_state || {}), model: chosen },
        metrics: r.metrics || {},
        trust_score: computeTrustworthyRate(r.metrics, w),
        stakes_level: inq.stakes_level,
      });
      const expiryDays = w.expiry_days || 30;
      const warrant = await base44.entities.Warrant.create({
        answer_version_id: av.id, premises: w.premises || [], conclusion: w.conclusion || '',
        confidence_score: w.confidence_score ?? 0, validity_status: w.validity_status || 'valid',
        sources: w.sources || [], expiry_date: new Date(Date.now() + expiryDays * 86400000).toISOString(),
        signed_hash: generateSignature([av.id, w.conclusion || '', (w.premises || []).join(';;')].join('|')),
      });
      await base44.entities.AnswerVersion.update(av.id, { warrant_id: warrant.id });
      const fullVersion = { ...av, warrant_id: warrant.id };

      const { gate, review } = await applyGate(inq, av, version, r.metrics, warrant);

      let correction = null;
      if (prev) {
        const oldTrust = computeTrustworthyRate(prev.metrics, prevWarrant);
        const drift = computeDrift({ cognitive_state: prev.cognitive_state, warrant: prevWarrant }, { cognitive_state: r.cognitive_state, warrant });
        const severity = correctionSeverity(gate.trust - oldTrust, drift.composite);
        const ttc = Math.max(1, Math.round((new Date(av.created_date).getTime() - new Date(prev.created_date).getTime()) / 1000));
        correction = await base44.entities.CorrectionEvent.create({
          inquiry_id: inq.id, from_version_id: prev.id, to_version_id: av.id,
          from_version: prev.version, to_version: version, severity, detected_by: 'self',
          time_to_correction: ttc, trust_delta: gate.trust - oldTrust, drift_score: drift.composite,
          notes: driftLabel(drift.composite).label,
        });
        await base44.entities.AuditLog.create({
          event_type: 'correction_logged', entity_type: 'AnswerVersion', entity_id: av.id,
          summary: `v${prev.version} → v${version} corrected (${severity}, MTTC ${ttc}s)`,
          metadata: { severity, ttc, drift: drift.composite },
        }).catch(() => {});
      }
      await base44.entities.AuditLog.create({
        event_type: 'answer_promoted', entity_type: 'AnswerVersion', entity_id: av.id,
        summary: `Answer v${version} ${gate.killSwitch ? 'generated' : 'promoted'} at ${gate.cap.key} (${gate.cap.label}) · trust ${gate.trust}`,
        metadata: { capability: gate.cap.key, trust: gate.trust, stakes: inq.stakes_level },
      }).catch(() => {});

      const allReviews = [...(active?.reviews || []), ...(review ? [review] : [])];
      setActive({
        inquiry: inq, version: fullVersion, warrant,
        versions: [...priorVersions, fullVersion],
        corrections: [...existingCorrections, ...(correction ? [correction] : [])],
        correction,
        reviews: allReviews,
        review,
        panel: active?.panel,
      });
      await loadHistory();
    } catch (e) {
      setError(e?.message || 'Revision failed.');
    } finally {
      setThinking(false);
    }
  }

  async function selectInquiry(id) {
    setThinking(true);
    setError(null);
    try {
      const inquiry = inquiries.find((i) => i.id === id);
      const versions = await base44.entities.AnswerVersion.filter({ inquiry_id: id }, 'version', 50);
      const corrections = await base44.entities.CorrectionEvent.filter({ inquiry_id: id }, '-created_date', 50);
      const reviews = await base44.entities.Review.filter({ inquiry_id: id }, '-created_date', 50);
      if (!versions.length) {
        setActive({ inquiry, version: null, warrant: null, versions: [], corrections: [], correction: null, reviews: [], review: null });
        return;
      }
      const latest = versions[versions.length - 1];
      let warrant = null;
      if (latest.warrant_id) {
        try { warrant = await base44.entities.Warrant.get(latest.warrant_id); } catch { /* warrant missing */ }
      }
      const correction = corrections.find((c) => c.to_version_id === latest.id) || null;
      const review = reviews.find((rv) => rv.answer_version_id === latest.id) || null;
      setActive({ inquiry, version: latest, warrant, versions, corrections, correction, reviews, review });
    } catch (e) {
      setError(e?.message);
    } finally {
      setThinking(false);
    }
  }

  function selectVersion(v) {
    setActive((prev) => {
      const correction = (prev?.corrections || []).find((c) => c.to_version_id === v.id) || null;
      const review = (prev?.reviews || []).find((rv) => rv.answer_version_id === v.id) || null;
      if (prev?.version?.id !== v.id && v.warrant_id) {
        base44.entities.Warrant.get(v.warrant_id)
          .then((w) => setActive((p) => ({ ...p, version: v, warrant: w, correction, review })))
          .catch(() => setActive((p) => ({ ...p, version: v, correction, review })));
      }
      return { ...prev, version: v, correction, review };
    });
  }

  function newInquiry() {
    setActive(null);
    setPrompt('');
    setError(null);
  }

  async function copyVerifyLink() {
    if (!active?.version?.id) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/verify/${active.version.id}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard unavailable */ }
  }

  const hasResult = !!active?.version;

  return (
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <PromptConsole
            prompt={prompt}
            setPrompt={setPrompt}
            domain={domain}
            setDomain={setDomain}
            stakes={stakes}
            setStakes={setStakes}
            onThink={handleThink}
            thinking={thinking}
            model={model}
            setModel={setModel}
            tribunalModels={tribunalModels}
            setTribunalModels={setTribunalModels}
          />

          <AnimatePresence mode="wait">
            {thinking && (
              <motion.div
                key="thinking"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="rounded-2xl border border-white/10 bg-[#0B0F16] p-10 flex flex-col items-center justify-center"
              >
                <Loader2 className="h-6 w-6 text-emerald-400 animate-spin mb-3" />
                <p className="text-sm text-slate-400">{stakes === 'low' ? 'Reasoning, assembling warrant…' : 'Running 3-way tribunal — answering, cross-examining, reconciling, merging…'}</p>
              </motion.div>
            )}
            {!thinking && error && (
              <motion.div
                key="err"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="rounded-2xl border border-rose-400/20 bg-rose-400/[0.04] p-4 flex items-start gap-3"
              >
                <AlertTriangle className="h-4 w-4 text-rose-300 mt-0.5 shrink-0" />
                <p className="text-sm text-rose-200">{error}</p>
              </motion.div>
            )}
            {!thinking && !error && hasResult && (
              <motion.div
                key="result"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-6"
              >
                {active.review && <ReviewBanner review={active.review} />}
                <div className="flex items-center gap-2 flex-wrap">
                  {active.tribunal && active.tribunal.mode === 'tribunal' ? (
                    <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.16em] text-emerald-300 bg-emerald-400/10 px-2 py-0.5 rounded-full">
                      <Swords className="h-3 w-3" /> Hardened answer · 3-way tribunal
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.16em] text-amber-300 bg-amber-400/10 px-2 py-0.5 rounded-full">
                      <Crown className="h-3 w-3" /> Top answer · ranked #1 by trust
                    </span>
                  )}
                </div>
                <AnswerCard version={active.version} correction={active.correction} />
                <VerifiedTag
                  trust={computeTrustworthyRate(active.version.metrics, active.warrant)}
                  warrant={active.warrant}
                  review={active.review}
                />
                <TrustScoreHeader
                  inquiry={active.inquiry}
                  version={active.version}
                  warrant={active.warrant}
                  review={active.review}
                  correction={active.correction}
                  explained={explained}
                  onExplain={() => setExplained((e) => !e)}
                  tribunal={active.tribunal}
                />
                {explained && (
                  <TrustExplainer
                    version={active.version}
                    warrant={active.warrant}
                    review={active.review}
                    correction={active.correction}
                  />
                )}
                <WarrantCard warrant={active.warrant} />
                <MetricsGrid metrics={active.version.metrics} warrant={active.warrant} />
                <WhatWouldChange warrant={active.warrant} version={active.version} />
                <div className="flex justify-end">
                  <Button size="sm" variant="outline" onClick={() => setChallengeOpen(true)}
                    className="h-11 md:h-8 border-amber-400/20 bg-transparent text-amber-300 hover:bg-amber-400/10 hover:text-amber-200">
                    <Swords className="h-3.5 w-3.5 mr-1.5" /> Challenge this answer
                  </Button>
                </div>
                <div className="flex justify-end gap-2">
                  <Button size="sm" onClick={() => setWhyOpen(true)}
                    className="h-11 md:h-8 bg-emerald-400 text-[#070A0F] hover:bg-emerald-300">
                    <ShieldCheck className="h-3.5 w-3.5 mr-1.5" /> Why trust this?
                  </Button>
                  <Button size="sm" variant="outline" onClick={copyVerifyLink}
                    className="h-11 md:h-8 border-white/10 bg-transparent text-slate-300 hover:bg-white/5 hover:text-white">
                    <Link2 className="h-3.5 w-3.5 mr-1.5" /> {copied ? 'Copied' : 'Verify link'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={reviseInquiry} disabled={thinking}
                    className="h-11 md:h-8 border-white/10 bg-transparent text-slate-300 hover:bg-white/5 hover:text-white">
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Revise
                  </Button>
                </div>
                <RankedAnswers results={active.panel} />
                {active.tribunal && active.tribunal.mode === 'tribunal' && (
                  <TribunalTrace tribunal={active.tribunal} candidates={active.panel} />
                )}
                <WhyTrustTour open={whyOpen} onOpenChange={setWhyOpen}
                  inquiry={active.inquiry} version={active.version} warrant={active.warrant}
                  review={active.review} correction={active.correction} />
                <ChallengePanel open={challengeOpen} onOpenChange={setChallengeOpen}
                  inquiry={active.inquiry} version={active.version} warrant={active.warrant} />
              </motion.div>
            )}
            {!thinking && !error && !hasResult && (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-10 text-center"
              >
                <p className="text-sm text-slate-400">
                  No active inquiry. Submit a prompt to receive a warranted, lineage-tracked answer.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="space-y-6">
          <InquiryHistory
            inquiries={inquiries}
            activeId={active?.inquiry?.id}
            onSelect={selectInquiry}
            onNew={newInquiry}
          />
          {active?.versions?.length > 0 && (
            <LineageTimeline
              versions={active.versions}
              activeId={active.version?.id}
              onSelect={selectVersion}
            />
          )}
        </div>
      </div>
  );
}

export default function Home() {
  return <AppShell><ConsoleContent /></AppShell>;
}