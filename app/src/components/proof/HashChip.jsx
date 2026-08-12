import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TEXT, FOCUS, EPISTEMIC } from '@/lib/design/tokens';

// A hash the visitor can actually take with them. Click copies the FULL value —
// never the truncated display, which is the classic way a "copy" button hands
// someone a useless string.
//
// Tones are deliberately NOT epistemic states: a digest is not a verdict. `yours`
// is the focus blue (the value your browser computed), `theirs` is muted slate
// (the value the server published), `neutral` is plain. Only the explicit
// `match` / `mismatch` tones carry judgement, and they are used solely on the
// final comparison — where a judgement is genuinely being made. Even there the
// colour is never alone: the caller pairs it with an EpistemicBadge and text.
//
// `diffAgainst` renders the shared prefix normally and everything from the first
// differing character in the `unsupported` hue, so a near-miss reads as a
// near-miss instead of two walls of hex.

const TONES = {
  neutral: { color: TEXT.secondary, border: 'rgba(255,255,255,0.10)', bg: 'rgba(255,255,255,0.02)' },
  yours: { color: FOCUS, border: 'rgba(125,211,252,0.28)', bg: 'rgba(125,211,252,0.06)' },
  theirs: { color: TEXT.muted, border: 'rgba(255,255,255,0.09)', bg: 'rgba(255,255,255,0.015)' },
  match: { color: EPISTEMIC.supported.hex, border: 'rgba(110,231,183,0.30)', bg: 'rgba(110,231,183,0.07)' },
  mismatch: { color: EPISTEMIC.unsupported.hex, border: 'rgba(251,113,133,0.32)', bg: 'rgba(251,113,133,0.07)' },
};

function firstDiff(a, b) {
  if (!a || !b) return -1;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i;
  return a.length === b.length ? -1 : n;
}

export default function HashChip({
  value,
  label,
  tone = 'neutral',
  truncate = 0,          // 0 = show the whole thing; N = N head chars … N tail chars
  diffAgainst = null,
  className,
  copyLabel,
}) {
  const [copied, setCopied] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const timer = useRef(null);
  const text = String(value ?? '');
  const t = TONES[tone] || TONES.neutral;

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = useCallback(async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setBlocked(false);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard denied (insecure origin, or the user refused permission). Say
      // so — a silent no-op reads as a broken button, and the full value is
      // still in the title attribute for manual selection.
      setBlocked(true);
    }
  }, [text]);

  if (!text) {
    return (
      <div className={cn('min-w-0', className)}>
        {label ? <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500 mb-1">{label}</div> : null}
        <div className="rounded-lg border border-dashed border-white/10 px-2.5 py-1.5 font-mono text-[11px] text-slate-500">
          not published
        </div>
      </div>
    );
  }

  const shown = truncate && text.length > truncate * 2 + 3
    ? `${text.slice(0, truncate)}…${text.slice(-truncate)}`
    : text;

  const cut = diffAgainst ? firstDiff(text, String(diffAgainst)) : -1;
  const body = cut >= 0 && !truncate
    ? (
      <>
        <span>{text.slice(0, cut)}</span>
        <span style={{ color: EPISTEMIC.unsupported.hex, textDecoration: 'underline', textDecorationStyle: 'wavy' }}>
          {text.slice(cut)}
        </span>
      </>
    )
    : shown;

  return (
    <div className={cn('min-w-0', className)}>
      {label ? <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500 mb-1">{label}</div> : null}
      <button
        type="button"
        onClick={copy}
        title={`${copyLabel || 'Copy'}: ${text}`}
        aria-label={`${copyLabel || 'Copy'} ${label ? `${label}: ` : ''}${text}`}
        className="group flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-colors hover:brightness-125 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7DD3FC]/70"
        style={{ borderColor: t.border, background: t.bg }}
      >
        <span
          className={cn('min-w-0 flex-1 font-mono text-[11px] leading-relaxed', truncate ? 'truncate' : 'break-all')}
          style={{ color: t.color }}
        >
          {body}
        </span>
        {copied
          ? <Check className="h-3 w-3 shrink-0" style={{ color: EPISTEMIC.supported.hex }} aria-hidden="true" />
          : <Copy className="h-3 w-3 shrink-0 text-slate-600 transition-colors group-hover:text-slate-300" aria-hidden="true" />}
        <span className="sr-only">{copied ? 'Copied' : 'Click to copy'}</span>
      </button>
      {blocked ? (
        <p className="mt-1 text-[10px] text-slate-500" role="status">
          Clipboard access was denied — the full value is in this element&apos;s tooltip, select it by hand.
        </p>
      ) : null}
    </div>
  );
}
