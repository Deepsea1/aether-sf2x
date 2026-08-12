import React from 'react';
import { motion } from 'framer-motion';
import { Quote, ScanSearch, Hourglass } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TEXT, transition } from '@/lib/design/tokens';
import EpistemicBadge from '@/components/aether/EpistemicBadge';
import HonestEmpty from '@/components/aether/HonestEmpty';

// THE CLAIMS, AS THEY LAND.
//
// Each {stage:'claim'} event carries exactly { claim, supported, notes } — a BOOLEAN,
// not a spectrum. The mapping is therefore forced and is stated in the page (see
// claimState there): true → `supported`, false → `unsupported`. Never `contested`:
// contested means credible sources DISAGREE, and this transport never reports a
// disagreement between sources — it reports one tribunal's single-pass judgement that
// the evidence does not carry the claim. Painting that amber would invent a second
// source that was never consulted.
//
// Counting honesty: {stage:'claims', count} arrives BEFORE the individual claims, so
// this component knows how many are still in flight. It says "3 of 7 received" — it
// does not render four ghost cards, because a placeholder shaped like a claim is a
// claim the tribunal never made.
//
// Timing honesty: the server emits every claim in a tight loop immediately after the
// single LLM pass returns, so in practice they arrive as a burst. The entrance
// transition is presentation. No per-claim elapsed time is shown, because none exists.

function ClaimRow({ item, index, reduced }) {
  return (
    <motion.li
      initial={reduced ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={transition('base', reduced)}
      className="flex gap-3 border-t border-white/5 py-3 first:border-t-0 first:pt-0"
    >
      <span
        className="mt-[3px] w-6 shrink-0 text-right font-mono text-[11px] tabular-nums"
        style={{ color: TEXT.muted }}
        aria-hidden="true"
      >
        {index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] leading-relaxed" style={{ color: TEXT.primary }}>{item.claim}</p>
        <div className="mt-2 flex flex-wrap items-start gap-2">
          <EpistemicBadge state={item.state} size="sm" />
          {item.notes ? (
            <span className="min-w-0 flex-1 text-[11.5px] leading-relaxed" style={{ color: TEXT.muted }}>
              {item.notes}
            </span>
          ) : (
            <span className="text-[11.5px]" style={{ color: TEXT.muted }}>
              no note published with this claim
            </span>
          )}
        </div>
      </div>
    </motion.li>
  );
}

export default function ClaimStream({
  claims = [],
  expected = null,     // from {stage:'claims', count} — null until that event arrives
  running = false,
  started = false,
  reduced = false,
  onStart,
  className,
}) {
  const outstanding = expected == null ? null : Math.max(0, expected - claims.length);

  if (!started) {
    return (
      <HonestEmpty
        className={className}
        title="No verification has run yet"
        reason="Nothing is being checked, so there are no claims to show. Paste some text above and the tribunal will decompose it into discrete factual claims, one event per claim."
        state="unknown"
        icon={ScanSearch}
        action={onStart ? { label: 'Use the example text', onClick: onStart } : undefined}
      />
    );
  }

  if (expected === 0) {
    return (
      <HonestEmpty
        className={className}
        title="The tribunal found no discrete factual claims"
        reason="It read the text and decomposed it into zero checkable claims — opinion, instruction or pure narration will do that. That is a real result, not a failure, and it is why no rows appear below."
        state="unknown"
        icon={Quote}
      />
    );
  }

  if (!claims.length) {
    return (
      <div className={cn('rounded-2xl border border-white/10 bg-[#0B0F16] p-5', className)}>
        <div className="text-[11px] uppercase tracking-[0.16em]" style={{ color: TEXT.muted }}>Claims</div>
        <p className="mt-2 text-[12px]" style={{ color: TEXT.muted }}>
          {running
            ? expected == null
              ? 'The tribunal is still decomposing the text. No claim events have arrived yet — this line is waiting on the wire, not on an animation.'
              : `${expected} claim${expected === 1 ? '' : 's'} announced; none received yet.`
            : 'The run ended without sending any claim events.'}
        </p>
      </div>
    );
  }

  return (
    <div className={cn('rounded-2xl border border-white/10 bg-[#0B0F16] p-5', className)}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] uppercase tracking-[0.16em]" style={{ color: TEXT.muted }}>
          Claims — one row per <code className="font-mono">stage:&quot;claim&quot;</code> event
        </div>
        <div className="text-[11px] tabular-nums" style={{ color: TEXT.muted }}>
          {expected == null
            ? `${claims.length} received · total not yet announced`
            : `${claims.length} of ${expected} received`}
        </div>
      </div>

      <ul className="divide-y-0" role="list">
        {claims.map((c, i) => <ClaimRow key={`${i}-${c.claim.slice(0, 24)}`} item={c} index={i} reduced={reduced} />)}
      </ul>

      {outstanding ? (
        <div className="mt-3 flex items-center gap-2 border-t border-white/5 pt-3 text-[11.5px]" style={{ color: TEXT.muted }}>
          <Hourglass className="h-3.5 w-3.5" aria-hidden="true" />
          {running
            ? `Waiting on ${outstanding} more claim event${outstanding === 1 ? '' : 's'}. No placeholder rows are drawn for them — an empty row shaped like a claim would be a claim nobody made.`
            : `The stream announced ${expected} claims but only ${claims.length} arrived. The missing ${outstanding} are unaccounted for, not silently dropped.`}
        </div>
      ) : null}
    </div>
  );
}
