import React from 'react';
import { motion } from 'framer-motion';
import { Loader2, Check, Minus, CircleDashed, TriangleAlert, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TEXT, FOCUS, EPISTEMIC } from '@/lib/design/tokens';

// THE PIPELINE RAIL — what the stream actually told us, and what we merely inferred.
//
// The honesty problem this component exists to solve: the tribunal is sold as four
// roles (proposer, critic, verifier, red-team), but `streamVerify` does not emit
// per-role events. It emits five pipeline stages — analyzing · claims · claim ·
// verdict · done (plus error) — and its prompt runs proposer/critic/verifier inside
// ONE model pass. There is no per-role telemetry to render.
//
// So this rail renders the stages as the primary, load-bearing row, because those are
// real events with real arrival times. The roles sit BELOW, visibly secondary, each
// marked as derived from the pipeline stage rather than observed. A role that the
// transport genuinely does not run at all (red-team is absent from streamVerify;
// only verifyResponse runs it) says exactly that instead of sitting at a hopeful grey.
//
// Deliberate: role activity does NOT use EpistemicBadge. "This role is working" is not
// a verdict about evidence, and borrowing the evidence palette for process state would
// erode the one vocabulary the product cannot afford to blur. Roles get neutral chrome
// — focus blue for working, slate for idle/done. The only place a role earns an
// epistemic badge is red-team's OUTCOME, which is a real judgement, and the page
// passes that in already-mapped.

const STATUS = {
  idle: { label: 'not started', Icon: CircleDashed, color: TEXT.muted },
  working: { label: 'working', Icon: Loader2, color: FOCUS, spin: true },
  done: { label: 'complete', Icon: Check, color: TEXT.secondary },
  na: { label: 'not run', Icon: Minus, color: TEXT.muted },
  failed: { label: 'failed', Icon: TriangleAlert, color: EPISTEMIC.unsupported.hex },
};

function statusOf(key) {
  return STATUS[key] || STATUS.idle;
}

function StageNode({ stage, reduced, isLast }) {
  const s = statusOf(stage.status);
  const { Icon } = s;
  const active = stage.status === 'working';

  return (
    <li className="flex min-w-0 flex-1 items-start gap-3 sm:flex-col sm:items-stretch sm:gap-0">
      <div className="flex items-center gap-2 sm:mb-2">
        <span
          className="relative inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border"
          style={{
            borderColor: active ? 'rgba(125,211,252,0.45)' : 'rgba(255,255,255,0.12)',
            background: active ? 'rgba(125,211,252,0.08)' : 'rgba(255,255,255,0.02)',
          }}
        >
          <Icon
            className={cn('h-3.5 w-3.5', s.spin && !reduced && 'animate-spin')}
            style={{ color: s.color }}
            aria-hidden="true"
          />
        </span>
        {/* The connector is decoration only; the status text below carries the state. */}
        <span
          aria-hidden="true"
          className="hidden h-px flex-1 sm:block"
          style={{ background: isLast ? 'transparent' : 'rgba(255,255,255,0.10)' }}
        />
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[12.5px] font-medium" style={{ color: active ? TEXT.primary : TEXT.secondary }}>
            {stage.label}
          </span>
          <code className="font-mono text-[10px]" style={{ color: TEXT.muted }}>{stage.event}</code>
        </div>
        <div className="mt-0.5 text-[11px]" style={{ color: TEXT.muted }}>
          {stage.detail || s.label}
        </div>
        {active && !reduced ? (
          <motion.div
            className="mt-1.5 h-px w-full origin-left"
            style={{ background: FOCUS, opacity: 0.5 }}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 1.1, repeat: Infinity, ease: 'linear' }}
          />
        ) : null}
      </div>
    </li>
  );
}

function RoleChip({ role }) {
  const s = statusOf(role.status);
  const { Icon } = s;
  return (
    <div
      className="flex items-start gap-2 rounded-xl border px-3 py-2"
      style={{ borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.015)' }}
    >
      <Icon
        className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', s.spin && 'animate-spin')}
        style={{ color: s.color }}
        aria-hidden="true"
      />
      <div className="min-w-0">
        <div className="text-[12px] font-medium" style={{ color: TEXT.secondary }}>{role.label}</div>
        <div className="text-[11px] leading-snug" style={{ color: TEXT.muted }}>
          {role.note || s.label}
        </div>
      </div>
    </div>
  );
}

export default function PipelineRail({ stages, roles, reduced, className, footnote, caption }) {
  return (
    <div className={cn('rounded-2xl border border-white/10 bg-[#0B0F16] p-5', className)}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] uppercase tracking-[0.16em]" style={{ color: TEXT.muted }}>
          Pipeline — observed events
        </div>
        <div className="text-[11px]" style={{ color: TEXT.muted }}>{caption}</div>
      </div>

      <ol className="flex flex-col gap-4 sm:flex-row sm:gap-3" role="list">
        {stages.map((s, i) => (
          <StageNode key={s.event} stage={s} reduced={reduced} isLast={i === stages.length - 1} />
        ))}
      </ol>

      <div className="mt-5 border-t border-white/10 pt-4">
        <div className="mb-2.5 flex flex-wrap items-center gap-2">
          <span className="text-[11px] uppercase tracking-[0.16em]" style={{ color: TEXT.muted }}>
            Roles — derived, not observed
          </span>
          <span
            className="inline-flex items-center gap-1 rounded-full border px-2 py-[2px] text-[10px]"
            style={{ borderColor: 'rgba(255,255,255,0.12)', color: TEXT.muted }}
          >
            <Info className="h-3 w-3" aria-hidden="true" /> inferred from pipeline stage
          </span>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {roles.map((r) => <RoleChip key={r.key} role={r} />)}
        </div>

        <p className="mt-3 text-[11.5px] leading-relaxed" style={{ color: TEXT.muted }}>
          The stream carries pipeline stages, not per-role telemetry. Proposer, critic and verifier are
          instructions inside a <em>single</em> model pass, so their lights are switched by the stage the
          stream is in — nobody watched three agents take turns, and this page will not draw three agents
          taking turns. {footnote}
        </p>
      </div>
    </div>
  );
}
