import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowDown, Play, Pause, SkipForward, RotateCcw, CornerDownRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { transition, EPISTEMIC, FOCUS } from '@/lib/design/tokens';
import EpistemicBadge from '@/components/aether/EpistemicBadge';
import HashChip from '@/components/proof/HashChip';

// The fold, drawn.
//
// An inclusion proof is a claim that one leaf lives inside a tree with a given
// root. Almost every product that shows you one shows you a green tick. This
// shows you the ladder: your leaf, then each sibling the log handed you, each
// pair hashed into the next node, every intermediate digest on screen and
// copyable, until the last output either equals the published root or does not.
//
// Two colours do all the work and neither is a verdict: FOCUS blue is the value
// YOUR browser is carrying upward, muted slate is a value the SERVER supplied.
// The only place a verdict colour appears is the final comparison, where a
// verdict is genuinely being made — and there it is paired with an
// EpistemicBadge and a sentence, never colour alone.
//
// Reduced motion: every step is revealed immediately and the transport still
// works. Nothing is hidden from someone who asked the animation to stop —
// that is the difference between collapsing motion and removing information.

const STEP_MS = 850;

function OperandBox({ hash, side, isCarry }) {
  return (
    <div
      className={cn(
        'min-w-0 flex-1 rounded-lg border p-2.5',
        isCarry ? 'border-[#7DD3FC]/30 bg-[#7DD3FC]/[0.05]' : 'border-white/10 bg-white/[0.015]',
      )}
    >
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className="text-[9px] uppercase tracking-[0.16em] text-slate-500">{side}</span>
        <span
          className="rounded px-1 py-px text-[9px] font-medium uppercase tracking-[0.12em]"
          style={
            isCarry
              ? { color: FOCUS, background: 'rgba(125,211,252,0.10)' }
              : { color: '#78879E', background: 'rgba(255,255,255,0.04)' }
          }
        >
          {isCarry ? 'your hash' : 'sibling from proof'}
        </span>
      </div>
      <HashChip value={hash} tone={isCarry ? 'yours' : 'theirs'} truncate={10} />
    </div>
  );
}

export default function MerkleFold({
  fold,
  leafSource,
  reduced = false,
  autoPlay = true,
  className,
}) {
  const steps = fold?.steps || [];
  const total = steps.length;

  const [revealed, setRevealed] = useState(() => (reduced ? total : 0));
  const [playing, setPlaying] = useState(() => (!reduced && autoPlay && total > 0));

  // Reduced motion, or a new proof arriving: land on a sane, information-complete state.
  useEffect(() => {
    setRevealed(reduced ? total : 0);
    setPlaying(!reduced && autoPlay && total > 0);
  }, [fold, reduced, total, autoPlay]);

  useEffect(() => {
    if (!playing || revealed >= total) return undefined;
    const id = setTimeout(() => setRevealed((n) => Math.min(total, n + 1)), STEP_MS);
    return () => clearTimeout(id);
  }, [playing, revealed, total]);

  useEffect(() => {
    if (revealed >= total && playing) setPlaying(false);
  }, [revealed, total, playing]);

  const done = revealed >= total;
  const carried = useMemo(
    () => (revealed === 0 ? fold?.computedLeafHash : steps[revealed - 1]?.out),
    [revealed, steps, fold],
  );

  // The leaf itself failed — there is no ladder to draw, and pretending otherwise
  // would be the exact dishonesty this page exists to refuse.
  if (fold?.failedStep === 'leaf' || fold?.failedStep === 'index' || fold?.failedStep === 'proof') {
    return (
      <div className={cn('rounded-2xl border border-[#FB7185]/30 bg-[#FB7185]/[0.05] p-5', className)}>
        <div className="flex flex-wrap items-center gap-2">
          <EpistemicBadge state="unsupported" label={`Failed at: ${fold.failedStep}`} />
          <span className="text-sm text-slate-200">The fold never started.</span>
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-slate-400">{fold.error}</p>
        {fold.computedLeafHash ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <HashChip label="Leaf hash your browser computed" value={fold.computedLeafHash} tone="yours" />
            <HashChip label="Leaf hash the proof claims" value={fold.claimedLeafHash} tone="mismatch" diffAgainst={fold.computedLeafHash} />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className={cn('rounded-2xl border border-white/10 bg-[#0B0F16] p-4 sm:p-5', className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">The fold</div>
          <p className="mt-1 text-[12px] text-slate-400">
            Leaf <span className="tabular-nums text-slate-300">{fold?.index}</span> of{' '}
            <span className="tabular-nums text-slate-300">{fold?.treeSize}</span> · {total}{' '}
            {total === 1 ? 'sibling' : 'siblings'} · {total === 0 ? 'no' : `${revealed}/${total}`} combined
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setRevealed((n) => Math.min(total, n + 1))}
            disabled={done}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.03] px-2.5 text-[11px] font-medium text-slate-300 transition-colors hover:border-white/30 disabled:opacity-30 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7DD3FC]/70"
          >
            <CornerDownRight className="h-3.5 w-3.5" /> Step
          </button>
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            disabled={done}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.03] px-2.5 text-[11px] font-medium text-slate-300 transition-colors hover:border-white/30 disabled:opacity-30 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7DD3FC]/70"
          >
            {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {playing ? 'Pause' : 'Play'}
          </button>
          <button
            type="button"
            onClick={() => { setPlaying(false); setRevealed(total); }}
            disabled={done}
            aria-label="Reveal every step at once"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 bg-white/[0.03] text-slate-300 transition-colors hover:border-white/30 disabled:opacity-30 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7DD3FC]/70"
          >
            <SkipForward className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => { setPlaying(false); setRevealed(0); }}
            disabled={revealed === 0}
            aria-label="Start the fold again"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 bg-white/[0.03] text-slate-300 transition-colors hover:border-white/30 disabled:opacity-30 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7DD3FC]/70"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* THE LEAF — recomputed here, not taken from the proof. */}
      <div className="mt-4 rounded-xl border border-[#7DD3FC]/25 bg-[#7DD3FC]/[0.04] p-3">
        <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Step 0 · your leaf</div>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <div className="min-w-0">
            <div className="mb-1 text-[10px] uppercase tracking-[0.16em] text-slate-500">Leaf material (the warrant&apos;s seal)</div>
            <div className="break-all rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5 font-mono text-[11px] text-slate-400">
              {leafSource || '—'}
            </div>
          </div>
          <HashChip label="SHA-256(0x00 ‖ leaf) — computed here" value={fold?.computedLeafHash} tone="yours" />
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
          The <span className="font-mono text-slate-400">0x00</span> prefix is RFC 6962&apos;s domain separator: it makes it
          impossible to pass an internal node off as a leaf. We hash the leaf ourselves rather than trusting the
          <span className="font-mono text-slate-400"> leaf_hash</span> in the proof — otherwise the log could nominate any leaf it liked.
        </p>
      </div>

      {/* THE LADDER */}
      {total === 0 ? (
        <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.015] p-4 text-[12px] leading-relaxed text-slate-400">
          This tree holds a single leaf, so there is nothing to combine: the leaf hash <em>is</em> the root. Small
          logs prove less than large ones — a one-leaf tree cannot show you that anything else was preserved.
        </div>
      ) : (
        <ol className="mt-4 space-y-2" role="list">
          {steps.map((s, i) => {
            const visible = i < revealed;
            const isNext = i === revealed;
            const carryIsLeft = s.siblingSide === 'right';
            return (
              <li key={s.level} className="relative pl-8">
                <span
                  aria-hidden="true"
                  className="absolute left-[13px] top-0 h-full w-px"
                  style={{ background: visible ? 'rgba(125,211,252,0.30)' : 'rgba(255,255,255,0.07)' }}
                />
                <span
                  aria-hidden="true"
                  className="absolute left-0 top-3 inline-flex h-[27px] w-[27px] items-center justify-center rounded-full border text-[10px] font-semibold tabular-nums"
                  style={{
                    borderColor: visible ? 'rgba(125,211,252,0.40)' : 'rgba(255,255,255,0.12)',
                    background: visible ? 'rgba(125,211,252,0.10)' : '#0B0F16',
                    color: visible ? FOCUS : '#4B5563',
                  }}
                >
                  {i + 1}
                </span>

                {visible ? (
                  <motion.div
                    initial={reduced ? false : { opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={transition('base', reduced)}
                    className="rounded-xl border border-white/10 bg-white/[0.02] p-3"
                  >
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Level {s.level}</span>
                      <span className="font-mono text-[10px] text-slate-500">
                        sibling sits on the {s.siblingSide}
                      </span>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                      <OperandBox hash={s.left} side="left" isCarry={carryIsLeft} />
                      <div className="flex shrink-0 items-center justify-center px-1 font-mono text-sm text-slate-600" aria-hidden="true">‖</div>
                      <OperandBox hash={s.right} side="right" isCarry={!carryIsLeft} />
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <ArrowDown className="h-3.5 w-3.5 shrink-0 text-slate-600" aria-hidden="true" />
                      <span className="font-mono text-[10px] text-slate-500">SHA-256(0x01 ‖ left ‖ right)</span>
                    </div>
                    <div className="mt-1.5">
                      <HashChip
                        label={i === total - 1 ? 'Result — this is your root' : 'Result — carried into the next level'}
                        value={s.out}
                        tone="yours"
                      />
                    </div>
                  </motion.div>
                ) : (
                  <div
                    className={cn(
                      'rounded-xl border border-dashed px-3 py-3 text-[11px]',
                      isNext ? 'border-white/20 text-slate-400' : 'border-white/[0.07] text-slate-600',
                    )}
                  >
                    Level {s.level} — {isNext ? 'next: combine with the sibling above' : 'not yet computed'}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {/* THE COMPARISON */}
      <div
        className={cn(
          'mt-4 rounded-xl border p-4',
          !done
            ? 'border-white/10 bg-white/[0.015]'
            : fold?.rootMatches
              ? 'border-[#6EE7B7]/30 bg-[#6EE7B7]/[0.05]'
              : 'border-[#FB7185]/30 bg-[#FB7185]/[0.05]',
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          <EpistemicBadge
            state={!done ? 'unknown' : fold?.rootMatches ? 'supported' : 'unsupported'}
            label={!done ? 'Fold still running' : fold?.rootMatches ? 'Root matches' : 'Root does NOT match'}
          />
          <span className="text-[12px] text-slate-300">
            {!done
              ? 'Keep stepping — the comparison happens once the last sibling is folded in.'
              : fold?.rootMatches
                ? 'Your browser reconstructed the published root from this leaf alone.'
                : (fold?.error || 'The reconstruction diverged from the published root.')}
          </span>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <HashChip
            label="Root your browser computed"
            value={done ? fold?.computedRoot : carried}
            tone={!done ? 'yours' : fold?.rootMatches ? 'match' : 'mismatch'}
          />
          <HashChip
            label="Root the log publishes"
            value={fold?.expectedRoot}
            tone={!done ? 'theirs' : fold?.rootMatches ? 'match' : 'mismatch'}
            diffAgainst={done && !fold?.rootMatches ? fold?.computedRoot : null}
          />
        </div>
        {done && !fold?.rootMatches ? (
          <p className="mt-3 text-[12px] leading-relaxed" style={{ color: EPISTEMIC.unsupported.hex }}>
            Do not accept this inclusion claim. A mismatch means one of three things: the proof is for a different
            leaf, the log published a root it cannot back up, or the tree changed between the proof and the root you
            are comparing against. It does not mean the underlying claim is false — it means this record is not
            provably in this log.
          </p>
        ) : null}
      </div>
    </div>
  );
}
