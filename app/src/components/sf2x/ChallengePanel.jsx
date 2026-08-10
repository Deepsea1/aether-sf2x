import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Swords, Crosshair, Lightbulb, ShieldQuestion } from 'lucide-react';
import { base44 } from '@/api/base44Client';

const PRESETS = [
  { label: 'Show me the weakest premise', Icon: Crosshair },
  { label: 'What would most change your mind?', Icon: Lightbulb },
  { label: 'Defend your premises', Icon: ShieldQuestion },
];

function buildPrompt(inquiry, version, warrant, challenge) {
  const w = warrant || {};
  const premises = (w.premises || []).map((p, i) => `  ${i + 1}. ${p}`).join('\n') || '  (none stated)';
  return `You are AETHER, an epistemic AI. Your prior answer is being cross-examined under adversarial epistemic scrutiny. Be honest about fragility — name the weakest link, don't retreat into hedging.

Inquiry: ${inquiry?.prompt || ''}
Your answer (v${version?.version}): ${version?.answer_text || ''}
Conclusion: ${w.conclusion || ''}
Premises:
${premises}
Sources: ${(w.sources || []).join('; ') || 'none'}

Cross-examination request: ${challenge}

Respond concisely and directly: identify fragile premises, unsupported leaps, and the single piece of evidence that would most change the conclusion. If the answer genuinely holds up, say why specifically.`;
}

export default function ChallengePanel({ open, onOpenChange, inquiry, version, warrant }) {
  const [challenge, setChallenge] = useState(PRESETS[0].label);
  const [reply, setReply] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const run = useCallback(async (text) => {
    if (!version) return;
    setLoading(true); setErr(null); setReply(null);
    try {
      const res = await base44.integrations.Core.InvokeLLM({ prompt: buildPrompt(inquiry, version, warrant, text) });
      setReply(typeof res === 'string' ? res : (res?.data ?? res?.answer ?? JSON.stringify(res)));
    } catch (e) {
      setErr(e?.message || 'Cross-examination failed.');
    } finally {
      setLoading(false);
    }
  }, [inquiry, version, warrant]);

  useEffect(() => {
    if (open && version) { setChallenge(PRESETS[0].label); run(PRESETS[0].label); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0B0F16] border-white/10 text-slate-200 max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-100">
            <Swords className="h-4 w-4 text-amber-400" /> Challenge AETHER — cross-examination
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-slate-500">
          Put the answer under adversarial epistemic scrutiny. AETHER must name its weakest link and what would change its mind — not hide behind fluency.
        </p>
        <div className="flex flex-wrap gap-2 mt-2">
          {PRESETS.map((p) => (
            <button key={p.label} onClick={() => { setChallenge(p.label); run(p.label); }}
              className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                challenge === p.label ? 'bg-amber-400/15 text-amber-300 border-amber-400/30' : 'bg-transparent text-slate-400 border-white/10 hover:text-slate-200'
              }`}>
              <p.Icon className="h-3.5 w-3.5" /> {p.label}
            </button>
          ))}
        </div>
        <Textarea value={challenge} onChange={(e) => setChallenge(e.target.value)} rows={2}
          placeholder="Or write your own challenge…"
          className="mt-3 resize-none bg-[#070A0F] border-white/10 text-slate-100 placeholder:text-slate-600 focus-visible:ring-amber-400/40" />
        <div className="flex justify-end">
          <Button size="sm" onClick={() => run(challenge)} disabled={loading || !challenge.trim()}
            className="bg-amber-400 text-[#070A0F] hover:bg-amber-300">
            {loading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Swords className="h-4 w-4 mr-1.5" />} Challenge
          </Button>
        </div>
        {loading && <p className="text-xs text-slate-500">Cross-examining…</p>}
        {err && <p className="text-xs text-rose-300">{err}</p>}
        {reply && (
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 max-h-72 overflow-auto">
            <p className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">{reply}</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}