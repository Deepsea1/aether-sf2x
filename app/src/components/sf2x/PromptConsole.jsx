import React from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import ResponsiveSelect from '@/components/sf2x/ResponsiveSelect';
import TribunalPicker from '@/components/sf2x/TribunalPicker';

const STAKES = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
];

const DOMAINS = ['General', 'Medicine', 'Finance', 'Legal', 'Engineering', 'Research', 'Policy'];

const MODELS = [
  { value: 'automatic', label: 'Base44 (auto)' },
  { value: 'claude_sonnet_4_6', label: 'Claude Sonnet 4.6' },
  { value: 'claude_opus_4_8', label: 'Claude Opus 4.8' },
  { value: 'gemini_3_flash', label: 'Gemini 3 Flash (web)' },
  { value: 'gpt_5_4', label: 'GPT-5.4' },
];

export default function PromptConsole({ prompt, setPrompt, domain, setDomain, stakes, setStakes, onThink, thinking, model, setModel, tribunalModels, setTribunalModels }) {
  const isTribunal = stakes !== 'low';
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent p-5 sm:p-6"
    >
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="h-4 w-4 text-emerald-400" />
        <h2 className="text-sm font-medium text-slate-200">Epistemic Console</h2>
        <span className="text-[11px] text-slate-500 hidden sm:inline">— {isTribunal ? '3-way tribunal · hardened warranted answer' : 'submit an inquiry, receive a warranted answer'}</span>
      </div>

      <Textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder=""
        className="min-h-[110px] resize-none bg-[#0B0F16] border-white/10 text-slate-100 placeholder:text-slate-600 focus-visible:ring-emerald-400/40"
        onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') onThink(); }}
      />

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <ResponsiveSelect
          value={domain}
          onValueChange={setDomain}
          options={DOMAINS.map((d) => ({ value: d, label: d }))}
          placeholder="Domain"
          triggerClassName="h-11 md:h-9 rounded-lg border border-white/10 bg-[#0B0F16] px-3 text-sm text-slate-200"
        />

        <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-[#0B0F16] p-1">
          {STAKES.map((s) => (
            <button
              key={s.value}
              onClick={() => setStakes(s.value)}
              className={`px-2.5 py-2 md:py-1 min-h-[44px] md:min-h-0 text-xs rounded-md transition-colors ${
                stakes === s.value ? 'bg-emerald-400/15 text-emerald-300' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {!isTribunal && (
          <ResponsiveSelect
            value={model}
            onValueChange={setModel}
            options={MODELS.map((m) => ({ value: m.value, label: m.label }))}
            placeholder="Model"
            triggerClassName="h-11 md:h-9 rounded-lg border border-white/10 bg-[#0B0F16] px-3 text-sm text-slate-200"
          />
        )}

        <div className="ml-auto">
          <Button
            onClick={onThink}
            disabled={thinking || !prompt.trim()}
            className="bg-emerald-400 text-[#070A0F] hover:bg-emerald-300 disabled:opacity-40 font-medium"
          >
            {thinking ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {isTribunal ? 'Tribunal' : 'Reasoning'}</>
            ) : (
              <><Sparkles className="h-4 w-4 mr-2" /> {isTribunal ? 'Run tribunal' : 'Think'}</>
            )}
          </Button>
        </div>
      </div>

      {isTribunal && (
        <TribunalPicker models={tribunalModels} setModels={setTribunalModels} />
      )}
    </motion.div>
  );
}