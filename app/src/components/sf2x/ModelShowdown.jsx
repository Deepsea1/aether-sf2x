import React, { useState } from 'react';
import { Loader2, Swords, CheckCircle2, AlertCircle, Crown, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { buildThinkPrompt, THINK_JSON_SCHEMA, computeTrustworthyRate } from '@/lib/sf2x';

// Perplexity isn't an available model here; Gemini 3 Flash with live web-search is the closest
// "search-backed" option, so we label it transparently.
const MODELS = [
  { value: 'automatic', label: 'Base44', tag: 'auto' },
  { value: 'claude_opus_4_8', label: 'Claude', tag: 'Opus 4.8' },
  { value: 'gemini_3_flash', label: 'Perplexity-style', tag: 'Gemini web-search' },
  { value: 'claude_sonnet_4_6', label: 'Claude Sonnet', tag: 'Sonnet 4.6' },
  { value: 'gpt_5_4', label: 'GPT-5.4', tag: 'OpenAI' },
];

const DEFAULT_PICKS = ['automatic', 'claude_opus_4_8', 'gemini_3_flash'];

const DEFAULT_PROMPT =
  'A patient on warfarin asks if they can start taking a daily low-dose aspirin for cardiovascular prevention. What is the epistemically warranted answer?';

function trustColor(t) {
  if (t >= 80) return 'text-emerald-300';
  if (t >= 60) return 'text-amber-300';
  return 'text-rose-300';
}
function trustRing(t) {
  if (t >= 80) return 'border-emerald-400/40';
  if (t >= 60) return 'border-amber-400/40';
  return 'border-rose-400/40';
}

export default function ModelShowdown() {
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [picked, setPicked] = useState(DEFAULT_PICKS);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState([]);

  function toggle(m) {
    setPicked((p) => (p.includes(m) ? p.filter((x) => x !== m) : [...p, m]));
  }

  async function runOne(m) {
    const params = { prompt: buildThinkPrompt(prompt, 'Medicine', 'high'), response_json_schema: THINK_JSON_SCHEMA };
    if (m !== 'automatic') params.model = m;
    if (m === 'gemini_3_flash') params.add_context_from_internet = true;
    const res = await base44.integrations.Core.InvokeLLM(params);
    const r = res && res.data ? res.data : res;
    const trust = computeTrustworthyRate(r.metrics || {}, r.warrant || {});
    return {
      model: m,
      label: MODELS.find((x) => x.value === m)?.label || m,
      tag: MODELS.find((x) => x.value === m)?.tag || '',
      answer: r.answer || '',
      warrant: r.warrant || {},
      metrics: r.metrics || {},
      trust,
    };
  }

  async function run() {
    if (!prompt.trim() || running || !picked.length) return;
    setRunning(true);
    setResults([]);
    try {
      const settled = await Promise.allSettled(picked.map((m) => runOne(m)));
      const out = settled.map((s, i) =>
        s.status === 'fulfilled'
          ? s.value
          : {
              model: picked[i],
              label: MODELS.find((x) => x.value === picked[i])?.label || picked[i],
              tag: MODELS.find((x) => x.value === picked[i])?.tag || '',
              answer: '',
              warrant: {},
              metrics: {},
              trust: 0,
              error: s.reason?.message || 'failed',
            }
      );
      out.sort((a, b) => b.trust - a.trust);
      setResults(out);
    } finally {
      setRunning(false);
    }
  }

  const topTrust = results.length ? results[0].trust : 0;

  return (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent p-5 sm:p-6">
      <div className="flex items-center gap-2 mb-4">
        <Swords className="h-4 w-4 text-emerald-400" />
        <h2 className="text-sm font-medium text-slate-200">Model Comparison</h2>
        <span className="text-[11px] text-slate-500 hidden sm:inline">— one prompt, side-by-side AI stress test</span>
      </div>

      <Textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Prompt to test across all models"
        className="min-h-[80px] resize-none bg-[#0B0F16] border-white/10 text-slate-100 placeholder:text-slate-600 focus-visible:ring-emerald-400/40"
      />

      <div className="mt-3 flex flex-wrap gap-2">
        {MODELS.map((m) => (
          <button
            key={m.value}
            onClick={() => toggle(m.value)}
            className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
              picked.includes(m.value)
                ? 'bg-emerald-400/15 text-emerald-300 border-emerald-400/30'
                : 'bg-transparent text-slate-500 border-white/10 hover:text-slate-300'
            }`}
          >
            {m.label} <span className="text-[10px] text-slate-600">{m.tag}</span>
          </button>
        ))}
      </div>

      <div className="mt-4 flex justify-end">
        <Button
          onClick={run}
          disabled={running || !prompt.trim() || !picked.length}
          className="bg-emerald-400 text-[#070A0F] hover:bg-emerald-300 disabled:opacity-40"
        >
          {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Swords className="h-4 w-4 mr-2" />} Run comparison
        </Button>
      </div>

      {running && (
        <div className="mt-5 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {picked.map((m) => {
            const meta = MODELS.find((x) => x.value === m) || { label: m, tag: '' };
            return (
              <div key={m} className="rounded-xl border border-white/10 bg-[#0B0F16] p-4 animate-pulse">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm text-slate-200 font-medium">{meta.label}</div>
                  <Loader2 className="h-3.5 w-3.5 text-slate-500 animate-spin" />
                </div>
                <div className="h-2 w-3/4 rounded bg-white/5 mb-2" />
                <div className="h-2 w-full rounded bg-white/5 mb-1.5" />
                <div className="h-2 w-5/6 rounded bg-white/5" />
              </div>
            );
          })}
        </div>
      )}

      {!running && results.length > 0 && (
        <div className="mt-5 grid sm:grid-cols-2 lg:grid-cols-3 gap-3 items-start">
          {results.map((r, i) => (
            <motion.div
              key={r.model}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className={`rounded-xl border bg-[#0B0F16] p-4 ${i === 0 ? `${trustRing(r.trust)} ring-1` : 'border-white/10'}`}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  {i === 0 && <Crown className="h-3.5 w-3.5 text-amber-400 shrink-0" />}
                  <span className="text-sm text-slate-200 font-medium truncate">{r.label}</span>
                </div>
                {r.error ? (
                  <AlertCircle className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                ) : (
                  <span className={`text-lg font-semibold ${trustColor(r.trust)}`}>{Math.round(r.trust)}</span>
                )}
              </div>
              <div className="text-[10px] text-slate-600 mb-2">{r.tag}</div>

              {r.error ? (
                <p className="text-xs text-rose-300/80">{r.error}</p>
              ) : (
                <>
                  <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap line-clamp-6">{r.answer}</p>

                  <div className="mt-3 space-y-1.5">
                    <Metric label="Trustworthy rate" value={`${Math.round(r.trust)}/100`} color={trustColor(r.trust)} />
                    <Metric label="Warrant confidence" value={`${Math.round((r.warrant?.confidence_score || 0) * 100)}%`} />
                    <Metric
                      label="Warrant validity"
                      value={r.warrant?.validity_status || '—'}
                      color={r.warrant?.validity_status === 'valid' ? 'text-emerald-300' : 'text-amber-300'}
                    />
                    <Metric label="Calibration error" value={r.metrics?.expected_calibration_error != null ? `${Math.round(r.metrics.expected_calibration_error * 100)}%` : '—'} />
                    <Metric label="Uncorrected confidence" value={r.metrics?.uncorrected_confidence_rate != null ? `${Math.round(r.metrics.uncorrected_confidence_rate * 100)}%` : '—'} />
                    <Metric label="Epistemic drift" value={r.metrics?.epistemic_drift_score != null ? `${Math.round(r.metrics.epistemic_drift_score * 100)}%` : '—'} />
                    <Metric label="Correction rate" value={r.metrics?.correction_rate != null ? `${Math.round(r.metrics.correction_rate * 100)}%` : '—'} />
                    <Metric label="Time-to-correction" value={r.metrics?.mean_time_to_correction != null ? `${Math.round(r.metrics.mean_time_to_correction)}s` : '—'} />
                  </div>

                  <div className="mt-3 flex items-center gap-1.5 text-[10px] text-slate-500">
                    {r.warrant?.validity_status === 'valid' && <CheckCircle2 className="h-3 w-3 text-emerald-400" />}
                    <span>{(r.warrant?.premises || []).length} premises · {(r.warrant?.sources || []).length} sources</span>
                  </div>
                </>
              )}
            </motion.div>
          ))}
        </div>
      )}

      {!running && results.length === 0 && (
        <div className="mt-5 rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-8 text-center">
          <Sparkles className="h-4 w-4 text-slate-600 mx-auto mb-2" />
          <p className="text-sm text-slate-500">Pick the models above and run a side-by-side comparison. The top-trust answer is highlighted.</p>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, color = 'text-slate-300' }) {
  return (
    <div className="flex items-center justify-between text-[11px]">
      <span className="text-slate-600">{label}</span>
      <span className={`font-medium ${color}`}>{value}</span>
    </div>
  );
}