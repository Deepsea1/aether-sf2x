import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldCheck, FileCheck2, Signature, AlertOctagon, Gauge, Server, RefreshCw, Loader2,
  Pause, Play, ScanSearch, Clock,
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import AppShell from '@/components/sf2x/AppShell';
import StatCard from '@/components/sf2x/StatCard';
import Surface from '@/components/aether/Surface';
import HonestEmpty from '@/components/aether/HonestEmpty';
import StateLegend from '@/components/aether/StateLegend';
import EpistemicBadge from '@/components/aether/EpistemicBadge';
import ServiceModeBanner from '@/components/cockpit/ServiceModeBanner';
import CapabilityPanel from '@/components/cockpit/CapabilityPanel';
import TransparencyLogPanel from '@/components/cockpit/TransparencyLogPanel';
import LedgerIntegrityPanel from '@/components/cockpit/LedgerIntegrityPanel';
import { TEXT, stateFor } from '@/lib/design/tokens';
import { useReducedMotion } from '@/lib/design/useReducedMotion';
import { timeUntilExpiry } from '@/lib/sf2x';

// THE TRUST COCKPIT — the page you leave open on the second monitor.
//
// It answers one question continuously: is the system being honest about itself right
// now? Four live panels, each owning its own endpoint and its own failure, so one dead
// service greys out one panel instead of blanking the page:
//
//   1. Service mode        driftAlert { op: 'mode' }
//   2. Verifier capability publishCalibration { op: 'capability_card', domain_pack_id }
//   3. Transparency log    warrantRegistry ?op=checkpoint  +  { op: 'consistency', … }
//   4. Ledger integrity    verifyLedgerIntegrity {}
//
// Below the live panels sit the standing commitments and the entity-derived counters
// that this page has always carried — kept, not replaced, and now honest when their
// fetch fails instead of silently rendering nothing.
//
// Refresh is gentle by design: a 60-second cycle, pausable, with the last-read time
// always visible. Under prefers-reduced-motion the cycle stays (information is never
// removed) and only the transitions collapse to instant. No spinner storms, no flashing.

const REFRESH_MS = 60_000;

const GUARANTEES = [
  {
    yes: 'Every promoted answer carries a Decision Validity Warrant.',
    no: 'SF2X does not guarantee the underlying sources are infallible — it guarantees the reasoning is traceable and correctable.',
  },
  {
    yes: 'Every answer has a signed, exportable provenance chain.',
    no: 'A high trust score is not a guarantee of truth — it is a guarantee of disciplined, auditable reasoning.',
  },
  {
    yes: 'Corrections and drift are logged and measured.',
    no: 'SF2X cannot prevent novel hallucinations it has never observed — it surfaces and corrects them fast.',
  },
];

const RISK_FRAMEWORK = [
  { tier: 'Low', desc: 'Informational or low-impact outputs. Auto-promote with monitoring.' },
  { tier: 'Medium', desc: 'Operational decisions. Monitored gate, spot review.' },
  { tier: 'High', desc: 'Consequential decisions. Human review on low trust.' },
  { tier: 'Regulated', desc: 'Life/health/finance. Mandatory human review + kill-switch.' },
];

function SectionHeading({ children, hint }) {
  return (
    <div className="mb-3">
      <h2 className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{children}</h2>
      {hint ? <p className="mt-1 text-[11.5px] text-slate-500">{hint}</p> : null}
    </div>
  );
}

export default function TrustCenter() {
  const reduced = useReducedMotion();

  // ——— the refresh clock, shared by every live panel
  const [tick, setTick] = useState(0);
  const [auto, setAuto] = useState(true);
  const [lastRead, setLastRead] = useState(null);
  const [severity, setSeverity] = useState('calm');

  const noteLoaded = useCallback(() => setLastRead(Date.now()), []);
  const noteSeverity = useCallback((s) => setSeverity((prev) => (prev === s ? prev : s)), []);
  const refreshAll = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!auto) return undefined;
    const id = setInterval(refreshAll, REFRESH_MS);
    return () => clearInterval(id);
  }, [auto, refreshAll]);

  // ——— the standing record: entity-derived counters this page has always shown
  const [data, setData] = useState(null);
  const [entityError, setEntityError] = useState(null);
  const [entityLoading, setEntityLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setEntityLoading(true);
      try {
        const [warrants, audits, corrections, bench, systems] = await Promise.all([
          base44.entities.Warrant.list('-created_date', 500),
          base44.entities.AuditLog.list('-created_date', 200),
          base44.entities.CorrectionEvent.list('-created_date', 200),
          base44.entities.BenchResult.list('-bench_score', 10),
          base44.entities.AISystem.list('-created_date', 100),
        ]);
        if (cancelled) return;
        const signed = warrants.filter((w) => w.signed_hash).length;
        const valid = warrants.filter((w) => w.validity_status === 'valid').length;
        const expired = warrants.filter((w) => timeUntilExpiry(w.expiry_date).expired).length;
        const incidents = audits.filter((a) => a.event_type === 'kill_switch' || a.event_type === 'drift_alert');
        const mttcSamples = corrections.filter((c) => Number.isFinite(Number(c.time_to_correction)));
        const avgMttc = mttcSamples.length
          ? Math.round(mttcSamples.reduce((s, c) => s + Number(c.time_to_correction), 0) / mttcSamples.length)
          : null;
        setData({
          warrantTotal: warrants.length, signed, valid, expired, incidents,
          avgMttc, mttcSamples: mttcSamples.length,
          bench: bench[0] || null, systems: systems.length,
        });
        setEntityError(null);
      } catch (e) {
        if (cancelled) return;
        setData(null);
        setEntityError(e?.response?.data?.error || e?.message || 'The record could not be read.');
      } finally {
        if (!cancelled) setEntityLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tick]);

  const dominant = severity !== 'calm';

  return (
    <AppShell>
      <div className="space-y-5">
        {/* ————————————————————————————————————— header + refresh */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-heading text-xl font-semibold text-white">Trust Cockpit</h1>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-500">
              The system&apos;s own honesty, inspectable at a glance. Every field on this page is read live from a named
              endpoint — and anything that has not been measured says so, rather than showing a zero.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-[0.16em]" style={{ color: TEXT.muted }}>Last read</div>
              <div className="text-[12px] tabular-nums text-slate-300">
                {lastRead ? new Date(lastRead).toLocaleTimeString() : 'reading…'}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setAuto((a) => !a)}
              aria-pressed={auto}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.03] px-2.5 text-[11px] text-slate-300 transition-colors hover:border-white/30 hover:bg-white/[0.07] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7DD3FC]/70"
              title={auto ? 'Pause the 60-second refresh' : 'Resume the 60-second refresh'}
            >
              {auto ? <Pause className="h-3.5 w-3.5" aria-hidden="true" /> : <Play className="h-3.5 w-3.5" aria-hidden="true" />}
              {auto ? 'Auto · 60s' : 'Paused'}
            </button>
            <button
              type="button"
              onClick={refreshAll}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.03] px-2.5 text-[11px] text-slate-300 transition-colors hover:border-white/30 hover:bg-white/[0.07] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7DD3FC]/70"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Refresh all
            </button>
          </div>
        </div>

        {/* 1 ——————————————————————————————————— service mode (dominates when degraded) */}
        <ServiceModeBanner tick={tick} onLoaded={noteLoaded} onSeverity={noteSeverity} />

        {dominant ? (
          <p className="-mt-2 text-[11.5px] leading-relaxed text-slate-400">
            The service is not in normal mode. Everything below is still read live and still true — but read the mode
            above first, because it changes what the rest of this page is worth.
          </p>
        ) : null}

        {/* 2 ——————————————————————————————————— verifier capability */}
        <CapabilityPanel tick={tick} onLoaded={noteLoaded} />

        {/* 3 ——————————————————————————————————— transparency log */}
        <TransparencyLogPanel tick={tick} onLoaded={noteLoaded} />

        {/* 4 ——————————————————————————————————— ledger integrity */}
        <LedgerIntegrityPanel tick={tick} onLoaded={noteLoaded} />

        {/* ————————————————————————————————————— the standing record */}
        <div className="pt-2">
          <SectionHeading hint="Counted from the record itself, not from a live probe. These move slowly; the panels above move in real time.">
            The record
          </SectionHeading>

          {entityLoading && !data && !entityError ? (
            <Surface>
              <p className="flex items-center gap-2 text-[12px] text-slate-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Counting warrants, corrections and incidents…
              </p>
            </Surface>
          ) : entityError ? (
            <HonestEmpty
              align="left"
              title="The record could not be counted"
              reason={`${entityError} — so none of the counters below can be shown. They are unknown, not zero.`}
              state="unknown"
              icon={ScanSearch}
              action={{ label: 'Try again', onClick: refreshAll }}
            />
          ) : data ? (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                <StatCard icon={Signature} label="Signed warrants" value={`${data.signed}`} suffix={` / ${data.warrantTotal}`} accent="sky" />
                <StatCard icon={ShieldCheck} label="Valid warrants" value={`${data.valid}`} accent="emerald" />
                <StatCard icon={Clock} label="Expired warrants" value={`${data.expired}`} accent="amber" />
                <StatCard icon={AlertOctagon} label="Incidents" value={`${data.incidents.length}`} accent="rose" />
                {data.avgMttc === null ? (
                  <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/5 text-slate-300">
                        <Gauge className="h-3.5 w-3.5" />
                      </span>
                      <span className="text-[11px] text-slate-500">Avg MTTC</span>
                    </div>
                    <EpistemicBadge state="unknown" size="sm" />
                    <p className="mt-1.5 text-[10.5px] leading-snug" style={{ color: TEXT.muted }}>
                      No correction has published a time-to-correction yet.
                    </p>
                  </div>
                ) : (
                  <StatCard icon={Gauge} label={`Avg MTTC · n=${data.mttcSamples}`} value={`${data.avgMttc}s`} accent="amber" />
                )}
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-3">
                <Surface>
                  <h3 className="text-sm font-medium text-slate-200">Evaluation summary</h3>
                  {data.bench ? (
                    <>
                      <div className="mt-1.5 text-2xl font-semibold tabular-nums" style={{ color: stateFor('supported').hex }}>
                        {data.bench.bench_score}<span className="text-sm text-slate-500">/100</span>
                      </div>
                      <p className="mt-1 text-[11px] text-slate-500">
                        Warrant {Math.round((data.bench.warrant_rate || 0) * 100)}% · Resist {Math.round((data.bench.resistance_rate || 0) * 100)}%
                      </p>
                      <Link to="/bench" className="mt-2 inline-block text-[11px] text-emerald-300 hover:text-emerald-200">View bench →</Link>
                    </>
                  ) : (
                    <HonestEmpty
                      className="mt-3"
                      align="left"
                      title="No benchmark recorded"
                      reason="Nothing has been benchmarked yet, so there is no score to report — not a score of zero."
                      state="unknown"
                      action={{ label: 'Open the bench', to: '/bench' }}
                    />
                  )}
                </Surface>

                <Surface>
                  <h3 className="text-sm font-medium text-slate-200">Incident history</h3>
                  {data.incidents.length === 0 ? (
                    <p className="mt-2 text-[11.5px] leading-relaxed text-slate-500">
                      No kill-switch or drift incidents are recorded in the {200} most recent audit events. That is the
                      window that was read, not the whole history.
                    </p>
                  ) : (
                    <div className="mt-2 max-h-40 space-y-1.5 overflow-y-auto pr-1">
                      {data.incidents.slice(0, 8).map((a) => (
                        <div key={a.id} className="text-[11px]">
                          <span className="font-mono uppercase" style={{ color: stateFor('unsupported').hex }}>
                            {String(a.event_type).replace(/_/g, ' ')}
                          </span>
                          <p className="text-slate-500">{a.summary || 'No summary published for this event.'}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </Surface>

                <Surface>
                  <div className="flex items-center gap-2">
                    <Server className="h-4 w-4 text-sky-400" aria-hidden="true" />
                    <h3 className="text-sm font-medium text-slate-200">System registry</h3>
                  </div>
                  <p className="mt-1.5 text-2xl font-semibold tabular-nums text-slate-200">{data.systems}</p>
                  <p className="text-[11px] text-slate-500">governed AI system{data.systems === 1 ? '' : 's'}</p>
                  <Link to="/systems" className="mt-2 inline-block text-[11px] text-sky-300 hover:text-sky-200">Manage systems →</Link>
                </Surface>
              </div>
            </>
          ) : null}
        </div>

        {/* ————————————————————————————————————— standing commitments */}
        <div className="pt-2">
          <SectionHeading hint="Fixed text, not a live reading — the promises the panels above exist to hold us to.">
            What we guarantee, and what we do not
          </SectionHeading>
          <div className="grid gap-3 md:grid-cols-3">
            {GUARANTEES.map((g, i) => (
              <Surface key={i} className="p-4">
                <div className="flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" style={{ color: stateFor('supported').hex }} aria-hidden="true" />
                  <p className="text-[12px] leading-relaxed text-slate-300">{g.yes}</p>
                </div>
                <div className="mt-2 flex items-start gap-2 border-t border-white/5 pt-2">
                  <span className="mt-0.5 text-[12px]" style={{ color: stateFor('unsupported').hex }} aria-hidden="true">✕</span>
                  <p className="text-[11px] leading-relaxed text-slate-500">{g.no}</p>
                </div>
              </Surface>
            ))}
          </div>

          <Surface className="mt-3">
            <div className="flex items-center gap-2">
              <FileCheck2 className="h-4 w-4 text-amber-400" aria-hidden="true" />
              <h3 className="text-sm font-medium text-slate-200">Risk framework</h3>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {RISK_FRAMEWORK.map((r) => (
                <div key={r.tier} className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                  <div className="text-[11px] font-medium text-slate-200">{r.tier}</div>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{r.desc}</p>
                </div>
              ))}
            </div>
          </Surface>
        </div>

        <StateLegend title="What every badge on this page means" />

        <p className="pb-2 text-[10.5px] leading-relaxed" style={{ color: TEXT.muted }}>
          Refresh cycle: {auto ? `every ${REFRESH_MS / 1000} seconds` : 'paused'}
          {reduced ? ' · reduced motion is on, so panels change state instantly — the readings themselves are unchanged' : ''}.
          Nothing on this page is cached across a reload, and nothing is filled in from memory when an endpoint is quiet.
        </p>
      </div>
    </AppShell>
  );
}
