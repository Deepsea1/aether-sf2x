import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Fingerprint, ChevronRight, Swords, Archive, Gauge, PenLine, AlertTriangle, Timer,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { TEXT, FOCUS, stateFor, transition } from '@/lib/design/tokens';
import EpistemicBadge from '@/components/aether/EpistemicBadge';
import Surface from '@/components/aether/Surface';
import HashChip from '@/components/proof/HashChip';

// THE VERDICT, AND THE HANDOFF.
//
// Everything here comes from one event — {stage:'verdict', trust_score, verdict,
// corrections, summary, warrant_id, tribunal_url, latency_ms} — or, on the
// verifyResponse fallback, from the single JSON body (which additionally carries
// red_team, certified, service_mode, cached, cache_age_seconds).
//
// Two presentations, deliberately different weights:
//   LIVE   — full card, the seal animates in, the proof handoff is the loudest thing.
//   CACHED — the same facts, quieter chrome, an explicit "served from cache (age X)"
//            header. A replayed verdict must never wear the costume of a fresh run;
//            the tribunal did not think just now, and the page says so before it says
//            anything else.
//
// Corrections are annotations, not prose: numbered, compact, and honestly unlinked.
// The backend returns `corrections` as a FLAT string array with no claim index, so
// this component never attaches one to a specific claim row. Inventing that linkage
// would be the most plausible-looking lie on the page.

function ago(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}

function Meter({ score, hex }) {
  const known = Number.isFinite(Number(score));
  const pct = known ? Math.max(0, Math.min(100, Number(score))) : 0;
  return (
    <div>
      <div className="flex items-baseline gap-2">
        {known ? (
          <>
            <span className="font-mono text-3xl font-semibold tabular-nums" style={{ color: hex }}>{pct}</span>
            <span className="text-[12px]" style={{ color: TEXT.muted }}>/ 100 trust score</span>
          </>
        ) : (
          <span className="text-[13px] font-medium" style={{ color: TEXT.muted }}>trust score not published</span>
        )}
      </div>
      <div
        className="mt-2 h-1.5 w-full overflow-hidden rounded-full"
        style={{ background: 'rgba(255,255,255,0.06)' }}
        role="img"
        aria-label={known ? `Trust score ${pct} out of 100` : 'Trust score not published'}
      >
        {known ? <div className="h-full rounded-full" style={{ width: `${pct}%`, background: hex }} /> : null}
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed" style={{ color: TEXT.muted }}>
        Calibrated 0–100 by the tribunal itself; it is instructed never to issue 100, and ≥90 only where it
        would stake its reputation. It is a confidence, not a probability anyone measured.
      </p>
    </div>
  );
}

export default function VerdictSeal({ result, reduced, className }) {
  if (!result) return null;

  const token = stateFor(result.verdictState);
  const cached = !!result.cached;
  const corrections = Array.isArray(result.corrections) ? result.corrections.filter(Boolean) : [];
  const degraded = result.service_mode && result.service_mode !== 'normal';

  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={transition('slow', reduced)}
      className={cn('space-y-4', className)}
    >
      {/* ——— cache first: a replay announces itself before it says anything else */}
      {cached ? (
        <div
          className="flex flex-wrap items-center gap-2 rounded-xl border px-3.5 py-2.5"
          style={{ borderColor: 'rgba(255,255,255,0.10)', background: 'rgba(255,255,255,0.015)' }}
        >
          <Archive className="h-3.5 w-3.5 shrink-0" style={{ color: TEXT.muted }} aria-hidden="true" />
          <span className="text-[12px] font-medium" style={{ color: TEXT.secondary }}>
            Served from cache (age {ago(result.cache_age_seconds)})
          </span>
          <span className="text-[11.5px]" style={{ color: TEXT.muted }}>
            — identical text had been verified before, so no tribunal ran just now. Every number below is a
            replay of that earlier verdict, not a fresh judgement.
          </span>
        </div>
      ) : null}

      {degraded ? (
        <div
          className="flex flex-wrap items-start gap-2 rounded-xl border px-3.5 py-2.5"
          style={{ borderColor: 'rgba(251,191,36,0.30)', background: 'rgba(251,191,36,0.06)' }}
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: stateFor('contested').hex }} aria-hidden="true" />
          <span className="text-[12px] leading-relaxed" style={{ color: TEXT.secondary }}>
            Service mode: <code className="font-mono">{result.service_mode}</code>
            {result.mode_read_error ? ' (the mode flag itself could not be read; this is the fallback value)' : ''} — the
            tribunal was not running in its normal configuration when this verdict was produced. Weigh it accordingly.
          </span>
        </div>
      ) : null}

      {/* ——— the verdict */}
      <Surface glow={cached ? false : token.key} tone={cached ? 'default' : 'raised'}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.16em]" style={{ color: TEXT.muted }}>
              {cached ? 'Cached verdict' : 'Verdict'}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <EpistemicBadge state={token.key} size="lg" />
              <span className="text-[12px]" style={{ color: TEXT.muted }}>
                tribunal verdict: <code className="font-mono" style={{ color: TEXT.secondary }}>{result.verdict || 'unstated'}</code>
              </span>
            </div>
            <p className="mt-2 max-w-xl text-[11.5px] leading-relaxed" style={{ color: TEXT.muted }}>
              {token.meaning}
            </p>
          </div>
          <div className="w-full max-w-[15rem]">
            <Meter score={result.trust_score} hex={token.hex} />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-white/10 pt-3 text-[11px]" style={{ color: TEXT.muted }}>
          {Number.isFinite(Number(result.latency_ms)) ? (
            <span className="inline-flex items-center gap-1.5">
              <Timer className="h-3 w-3" aria-hidden="true" />
              <span className="tabular-nums">{result.latency_ms} ms</span>
              <span>{cached ? 'on the original run' : 'server-side'}</span>
            </span>
          ) : null}
          {result.tribunal_version ? <span>pipeline {result.tribunal_version}</span> : null}
          <span>transport: <code className="font-mono">{result.transport === 'stream' ? 'streamVerify (SSE)' : 'verifyResponse (single response)'}</code></span>
        </div>

        {result.summary ? (
          <div className="mt-4 border-t border-white/10 pt-4">
            <div className="text-[11px] uppercase tracking-[0.16em]" style={{ color: TEXT.muted }}>The tribunal&apos;s own summary</div>
            <p className="mt-1.5 text-[12.5px] leading-relaxed" style={{ color: TEXT.secondary }}>{result.summary}</p>
          </div>
        ) : null}
      </Surface>

      {/* ——— corrections as annotations */}
      <Surface>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <PenLine className="h-4 w-4" style={{ color: TEXT.secondary }} aria-hidden="true" />
            <span className="text-sm font-medium text-white">Corrections</span>
          </div>
          <span className="text-[11px] tabular-nums" style={{ color: TEXT.muted }}>
            {corrections.length} issued
          </span>
        </div>

        {corrections.length === 0 ? (
          <p className="mt-3 text-[12px] leading-relaxed" style={{ color: TEXT.muted }}>
            The tribunal issued no corrections. That is not the same as &ldquo;every claim is true&rdquo; — read the
            per-claim states above, where an unsupported claim can exist with nothing proposed to replace it.
          </p>
        ) : (
          <>
            <ul className="mt-3 grid gap-2" role="list">
              {corrections.map((c, i) => (
                <li
                  key={i}
                  className="flex gap-2.5 rounded-xl border px-3 py-2.5"
                  style={{ borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.015)' }}
                >
                  <span
                    className="mt-[1px] inline-flex h-4 w-4 shrink-0 items-center justify-center rounded font-mono text-[10px] tabular-nums"
                    style={{ background: 'rgba(255,255,255,0.06)', color: TEXT.muted }}
                    aria-hidden="true"
                  >
                    {i + 1}
                  </span>
                  <span className="text-[12.5px] leading-relaxed" style={{ color: TEXT.secondary }}>{c}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] leading-relaxed" style={{ color: TEXT.muted }}>
              These arrive as a flat list. The backend does not say which claim each one corrects, so this page
              does not pin them to claim rows — a confident-looking arrow to the wrong claim would be worse than
              the honest gap.
            </p>
          </>
        )}
      </Surface>

      {/* ——— red team */}
      <Surface>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Swords className="h-4 w-4" style={{ color: TEXT.secondary }} aria-hidden="true" />
            <span className="text-sm font-medium text-white">Red-team stress test</span>
          </div>
          <EpistemicBadge state={result.redTeamState} size="sm" label={result.redTeamLabel} />
        </div>
        <p className="mt-3 text-[12px] leading-relaxed" style={{ color: TEXT.muted }}>{result.redTeamNote}</p>
        {result.red_team?.run_id ? (
          <div className="mt-3">
            <HashChip label="Red-team run id" value={result.red_team.run_id} tone="theirs" />
          </div>
        ) : null}
      </Surface>

      {/* ——— the seal, and the handoff that is the whole point */}
      <Surface tone="raised">
        <div className="flex items-center gap-2">
          <Fingerprint className="h-4 w-4" style={{ color: FOCUS }} aria-hidden="true" />
          <span className="text-sm font-medium text-white">The warrant was sealed</span>
        </div>

        {result.warrant_id ? (
          <>
            <p className="mt-2.5 text-[12.5px] leading-relaxed" style={{ color: TEXT.muted }}>
              The verdict above is now a signed row in an append-only log. Nothing on this page proves that —
              we told you it happened. The next page lets you check it without trusting us: your own browser
              recomputes the canonical bytes, the SHA-256, the Ed25519 signature and the Merkle path.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <HashChip label="Warrant id" value={result.warrant_id} tone="theirs" />
              {result.tribunal_url ? (
                <div className="flex items-end">
                  <Link
                    to={result.tribunal_url}
                    className="inline-flex items-center gap-1.5 text-[12px] hover:underline"
                    style={{ color: FOCUS }}
                  >
                    Open the full verification record <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              ) : null}
            </div>

            <Link
              to={`/proof?q=${encodeURIComponent(result.warrant_id)}`}
              className="mt-4 flex items-center justify-between gap-3 rounded-xl border px-4 py-3.5 transition-colors focus:outline-none focus-visible:ring-2"
              style={{ borderColor: 'rgba(125,211,252,0.35)', background: 'rgba(125,211,252,0.06)' }}
            >
              <span className="min-w-0">
                <span className="block text-[13.5px] font-medium" style={{ color: TEXT.primary }}>
                  Now go verify the cryptography yourself
                </span>
                <span className="mt-0.5 block text-[11.5px]" style={{ color: TEXT.muted }}>
                  Opens the Proof Theater on this exact warrant — your machine does the maths, not ours.
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0" style={{ color: FOCUS }} aria-hidden="true" />
            </Link>
          </>
        ) : (
          <div className="mt-3 flex items-start gap-2">
            <Gauge className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: TEXT.muted }} aria-hidden="true" />
            <p className="text-[12px] leading-relaxed" style={{ color: TEXT.muted }}>
              No warrant id came back with this verdict, so there is nothing to look up in the log and no proof to
              hand you. The verdict stands on our word alone until a sealed record exists — which is exactly the
              situation this product exists to remove.
            </p>
          </div>
        )}
      </Surface>
    </motion.div>
  );
}
