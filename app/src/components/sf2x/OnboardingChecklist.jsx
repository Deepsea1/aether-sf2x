import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound, Terminal, Package, Webhook, Layout, Puzzle, Check, Loader2, Sparkles } from 'lucide-react';
import { base44 } from '@/api/base44Client';

const STEPS = [
  { key: 'apikey', label: 'Generate an API key', desc: 'Create your sk_sf2x_ key for authenticating API calls.', Icon: KeyRound },
  { key: 'firstcall', label: 'Make your first API call', desc: 'Try the playground or hit the API directly.', Icon: Terminal },
  { key: 'sdk', label: 'Install the SDK (npm or pip)', desc: 'Use the Python or TypeScript SDK to integrate.', Icon: Package },
  { key: 'webhook', label: 'Set up a webhook for alerts', desc: 'Get notified when gates fire or drift spikes.', Icon: Webhook },
  { key: 'embed', label: 'Embed a verification widget on your site', desc: 'Paste a snippet to show trust badges.', Icon: Layout },
  { key: 'extension', label: 'Install the browser extension', desc: 'Verify any AI response on ChatGPT, Claude, Gemini.', Icon: Puzzle },
];

export default function OnboardingChecklist() {
  const [keys, setKeys] = useState([]);
  const [hooks, setHooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try {
      const [k, h] = await Promise.all([
        base44.entities.ApiKey.list('-created_date', 10).catch(() => []),
        base44.entities.WebhookConfig.list('-created_date', 10).catch(() => []),
      ]);
      setKeys(k || []);
      setHooks(h || []);
    } catch { /* */ }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const done = (key) => {
    if (loading) return false;
    if (key === 'apikey') return keys.some((k) => k.active);
    if (key === 'webhook') return hooks.some((h) => h.active);
    return false;
  };

  const visibleSteps = STEPS.filter((s) => !done(s.key));
  const completedCount = STEPS.length - visibleSteps.length;

  const handleStepClick = (key) => {
    navigate(`/integration-support?step=${key}`);
  };

  if (!loading && visibleSteps.length === 0) {
    return (
      <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.04] p-5 text-center">
        <Check className="h-5 w-5 text-emerald-300 mx-auto mb-2" />
        <p className="text-sm text-emerald-200">All set! Your account is fully configured.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-medium text-slate-200">Get started in 6 steps</h3>
        {!loading && (
          <span className="text-[11px] text-slate-500">{completedCount}/{STEPS.length} done</span>
        )}
      </div>
      <p className="text-[11px] text-slate-500 mb-4">Click any step and the assistant will walk you through it.</p>
      <div className="space-y-2">
        {visibleSteps.map((s) => (
          <button
            key={s.key}
            onClick={() => handleStepClick(s.key)}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-colors group w-full text-left"
          >
            <div className="h-6 w-6 rounded-full flex items-center justify-center shrink-0 bg-white/5 text-slate-500">
              <s.Icon className="h-3.5 w-3.5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium text-slate-200">{s.label}</div>
              <div className="text-[11px] text-slate-500 truncate">{s.desc}</div>
            </div>
            <Sparkles className="h-3.5 w-3.5 text-slate-600 group-hover:text-emerald-300 shrink-0" />
          </button>
        ))}
      </div>
      {loading && (
        <div className="flex items-center gap-2 mt-3 text-[11px] text-slate-600">
          <Loader2 className="h-3 w-3 animate-spin" /> Checking your setup…
        </div>
      )}
    </div>
  );
}