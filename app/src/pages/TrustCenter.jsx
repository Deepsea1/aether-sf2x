import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, FileCheck2, Signature, AlertOctagon, Gauge, Server } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import AppShell from '@/components/sf2x/AppShell';
import StatCard from '@/components/sf2x/StatCard';
import LedgerIntegrityCard from '@/components/sf2x/LedgerIntegrityCard';
import { computeTrustworthyRate, timeUntilExpiry } from '@/lib/sf2x';

const RISK_FRAMEWORK = [
  { tier: 'Low', desc: 'Informational or low-impact outputs. Auto-promote with monitoring.' },
  { tier: 'Medium', desc: 'Operational decisions. Monitored gate, spot review.' },
  { tier: 'High', desc: 'Consequential decisions. Human review on low trust.' },
  { tier: 'Regulated', desc: 'Life/health/finance. Mandatory human review + kill-switch.' },
];

const GUARANTEES = [
  { yes: 'Every promoted answer carries a Decision Validity Warrant.', no: 'SF2X does not guarantee the underlying sources are infallible — it guarantees the reasoning is traceable and correctable.' },
  { yes: 'Every answer has a signed, exportable provenance chain.', no: 'A high trust score is not a guarantee of truth — it is a guarantee of disciplined, auditable reasoning.' },
  { yes: 'Corrections and drift are logged and measured.', no: 'SF2X cannot prevent novel hallucinations it has never observed — it surfaces and corrects them fast.' },
];

const CAPABILITY_PACKS = ['general-verify', 'technical-docs@1.0'];

// A rate is a number or it is not measured — never a dash that could read as zero.
const rateLabel = (v) => (typeof v === 'number' ? `${(v * 100).toFixed(1)}%` : 'not yet measured');

// Verifier capability card (§18): what the verifier has MEASURED it can do per
// domain pack, and whether the symmetric §18.2 gate allows enforcement. The
// enforcing verdict comes from the server so every consumer sees the same gate.
function VerifierCapabilityCard() {
  const [packs, setPacks] = useState(null);

  useEffect(() => {
    (async () => {
      const results = await Promise.all(CAPABILITY_PACKS.map(async (packId) => {
        try {
          const res = await base44.functions.invoke('publishCalibration', { op: 'capability_card', domain_pack_id: packId });
          const d = res?.data || res;
          return { packId, card: d?.card || null, enforcing: d?.enforcing || { allowed: false, reasons: ['enforcing status unavailable'] } };
        } catch {
          return { packId, card: null, enforcing: { allowed: false, reasons: ['capability card fetch failed'] } };
        }
      }));
      setPacks(results);
    })();
  }, []);

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5">
      <div className="flex items-center gap-2 mb-1">
        <Gauge className="h-4 w-4 text-sky-400" />
        <h2 className="text-sm font-medium text-slate-200">Verifier Capability</h2>
      </div>
      <p className="text-[11px] text-slate-500 mb-3">Measured limits per domain pack. Enforcement unlocks only with a measured false-block rate (high ≤ 10%, critical ≤ 5%) and measured extraction recall — unmeasured fails closed to advisory.</p>
      {!packs ? (
        <p className="text-xs text-slate-600">Loading capability cards…</p>
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          {packs.map(({ packId, card, enforcing }) => (
            <div key={packId} className="rounded-lg bg-white/[0.02] border border-white/5 p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[11px] font-medium text-slate-200 font-mono">{packId}</div>
                {enforcing.allowed ? (
                  <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border border-emerald-400/30 text-emerald-300">
                    <ShieldCheck className="h-3 w-3" /> Enforcing unlocked
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border border-amber-400/30 text-amber-300">
                    <AlertOctagon className="h-3 w-3" /> Advisory only
                  </span>
                )}
              </div>
              {card ? (
                <>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] mb-2">
                    <span className="text-slate-500">False-pass (high)</span>
                    <span className="text-slate-300 tabular-nums">{rateLabel(card.false_pass_rate_by_risk?.high)}</span>
                    <span className="text-slate-500">False-block (high)</span>
                    <span className="text-slate-300 tabular-nums">{rateLabel(card.false_block_rate_by_risk?.high)}</span>
                    <span className="text-slate-500">False-block (critical)</span>
                    <span className="text-slate-300 tabular-nums">{rateLabel(card.false_block_rate_by_risk?.critical)}</span>
                    <span className="text-slate-500">Extraction recall</span>
                    <span className="text-slate-300 tabular-nums">{rateLabel(card.extraction_recall)}</span>
                  </div>
                  <p className="text-[10px] text-slate-600 mb-2">Verifier {card.verifier_version}{card.reviewed_at && <> · reviewed {new Date(card.reviewed_at).toLocaleDateString()}</>}{card.expires_at && <> · expires {new Date(card.expires_at).toLocaleDateString()}</>}</p>
                </>
              ) : (
                <p className="text-[11px] text-slate-500 mb-2">No capability card generated yet — nothing is measured for this pack.</p>
              )}
              {!enforcing.allowed && enforcing.reasons.length > 0 && (
                <div className="pt-2 border-t border-white/5 mb-2">
                  <div className="text-[10px] uppercase tracking-wider text-slate-600 mb-1">Enforcement locked because</div>
                  <ul className="space-y-0.5">
                    {enforcing.reasons.map((r, i) => (
                      <li key={i} className="text-[11px] text-amber-300/80">· {r}</li>
                    ))}
                  </ul>
                </div>
              )}
              {card && (card.known_limitations || []).length > 0 && (
                <div className="pt-2 border-t border-white/5">
                  <div className="text-[10px] uppercase tracking-wider text-slate-600 mb-1">Known limitations</div>
                  <ul className="space-y-0.5">
                    {card.known_limitations.map((l, i) => (
                      <li key={i} className="text-[11px] text-slate-500">· {l}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TrustCenter() {
  const [data, setData] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [warrants, audits, corrections, bench, systems] = await Promise.all([
          base44.entities.Warrant.list('-created_date', 500),
          base44.entities.AuditLog.list('-created_date', 200),
          base44.entities.CorrectionEvent.list('-created_date', 200),
          base44.entities.BenchResult.list('-bench_score', 10),
          base44.entities.AISystem.list('-created_date', 100),
        ]);
        const signed = warrants.filter((w) => w.signed_hash).length;
        const valid = warrants.filter((w) => w.validity_status === 'valid').length;
        const expired = warrants.filter((w) => timeUntilExpiry(w.expiry_date).expired).length;
        const incidents = audits.filter((a) => a.event_type === 'kill_switch' || a.event_type === 'drift_alert');
        const avgMttc = corrections.length ? Math.round(corrections.reduce((s, c) => s + (Number(c.time_to_correction) || 0), 0) / corrections.length) : 0;
        const avgDrift = corrections.length ? corrections.reduce((s, c) => s + (Number(c.drift_score) || 0), 0) / corrections.length : 0;
        setData({ warrantTotal: warrants.length, signed, valid, expired, incidents, avgMttc, avgDrift, bench: bench[0] || null, systems: systems.length });
      } catch {
        setData(null);
      }
    })();
  }, []);

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="font-heading text-xl font-semibold text-white">Trust Center</h1>
          <p className="text-sm text-slate-500">What SF2X guarantees, the evidence behind it, and how to verify it.</p>
        </div>

        {/* Guarantees */}
        <div className="grid md:grid-cols-2 gap-4">
          {GUARANTEES.map((g, i) => (
            <div key={i} className="rounded-2xl border border-white/10 bg-[#0B0F16] p-4">
              <div className="flex items-start gap-2 mb-2">
                <ShieldCheck className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
                <p className="text-xs text-slate-300">{g.yes}</p>
              </div>
              <div className="flex items-start gap-2 pt-2 border-t border-white/5">
                <span className="text-rose-400 text-xs mt-0.5">✕</span>
                <p className="text-[11px] text-slate-500">{g.no}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Verifier capability — measured limits + the §18.2 enforcing gate */}
        <VerifierCapabilityCard />

        {data && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard icon={Signature} label="Signed warrants" value={`${data.signed}`} suffix={`/ ${data.warrantTotal}`} accent="sky" />
              <StatCard icon={ShieldCheck} label="Valid warrants" value={`${data.valid}`} accent="emerald" />
              <StatCard icon={AlertOctagon} label="Incidents" value={`${data.incidents.length}`} accent="rose" />
              <StatCard icon={Gauge} label="Avg MTTC" value={`${data.avgMttc}s`} accent="amber" />
            </div>

            {/* Risk framework */}
            <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5">
              <div className="flex items-center gap-2 mb-3">
                <FileCheck2 className="h-4 w-4 text-amber-400" />
                <h2 className="text-sm font-medium text-slate-200">Risk Framework</h2>
              </div>
              <div className="grid sm:grid-cols-2 gap-2">
                {RISK_FRAMEWORK.map((r) => (
                  <div key={r.tier} className="rounded-lg bg-white/[0.02] border border-white/5 p-3">
                    <div className="text-[11px] font-medium text-slate-200 mb-0.5">{r.tier}</div>
                    <p className="text-[11px] text-slate-500">{r.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Ledger integrity — provenance chain verification */}
            <LedgerIntegrityCard />

            {/* Evaluation + incident + registry */}
            <div className="grid lg:grid-cols-3 gap-4">
              <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5">
                <h3 className="text-sm font-medium text-slate-200 mb-2">Evaluation Summary</h3>
                {data.bench ? (
                  <>
                    <div className="text-2xl font-semibold text-emerald-300">{data.bench.bench_score}<span className="text-sm text-slate-500">/100</span></div>
                    <p className="text-[11px] text-slate-500 mt-1">Warrant {Math.round((data.bench.warrant_rate || 0) * 100)}% · Resist {Math.round((data.bench.resistance_rate || 0) * 100)}%</p>
                    <Link to="/bench" className="text-[11px] text-emerald-300 hover:text-emerald-200 mt-2 inline-block">View bench →</Link>
                  </>
                ) : <p className="text-xs text-slate-600">No benchmark recorded.</p>}
              </div>

              <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5">
                <h3 className="text-sm font-medium text-slate-200 mb-2">Incident History</h3>
                {data.incidents.length === 0 ? (
                  <p className="text-xs text-slate-600">No kill-switch or drift incidents.</p>
                ) : (
                  <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                    {data.incidents.slice(0, 8).map((a) => (
                      <div key={a.id} className="text-[11px]">
                        <span className="text-rose-300 font-mono uppercase">{a.event_type.replace(/_/g, ' ')}</span>
                        <p className="text-slate-500">{a.summary}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5">
                <div className="flex items-center gap-2 mb-2">
                  <Server className="h-4 w-4 text-sky-400" />
                  <h3 className="text-sm font-medium text-slate-200">System Registry</h3>
                </div>
                <p className="text-2xl font-semibold text-slate-200">{data.systems}</p>
                <p className="text-[11px] text-slate-500">governed AI system{data.systems === 1 ? '' : 's'}</p>
                <Link to="/systems" className="text-[11px] text-sky-300 hover:text-sky-200 mt-2 inline-block">Manage systems →</Link>
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}