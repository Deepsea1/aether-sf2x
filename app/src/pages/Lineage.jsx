import React, { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { GitBranch, ScrollText, Link2, ShieldCheck, Hash, MessageSquare } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import AppShell from '@/components/sf2x/AppShell';
import ResponsiveSelect from '@/components/sf2x/ResponsiveSelect';
import EmptyState from '@/components/sf2x/EmptyState';
import SignatureChain from '@/components/sf2x/SignatureChain';
import DebateTimeline from '@/components/sf2x/DebateTimeline';
import { computeTrustworthyRate, timeUntilExpiry, VALIDITY_STYLES } from '@/lib/sf2x';
import { assessCapability } from '@/lib/sf2xGovernance';
import { formatDistanceToNow } from 'date-fns';

function Node({ icon: Icon, tone, label, children }) {
  return (
    <div className="relative pl-5">
      <span className="absolute left-0 top-0 bottom-0 w-px bg-white/10" />
      <span className={`absolute -left-[3px] top-3.5 h-2 w-2 rounded-full ${tone}`} />
      <div className="pt-2.5">
        <div className="flex items-center gap-1.5 mb-1">
          <Icon className="h-3.5 w-3.5 text-slate-500" />
          <span className="text-[11px] uppercase tracking-wider text-slate-500">{label}</span>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function Lineage() {
  const [inquiries, setInquiries] = useState([]);
  const [tree, setTree] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const list = await base44.entities.Inquiry.list('-created_date', 50);
    setInquiries(list);
    if (list.length) await build(list[0].id, list);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function build(id, listArg) {
    const inquiry = (listArg || inquiries).find((i) => i.id === id) || await base44.entities.Inquiry.get(id);
    const versions = await base44.entities.AnswerVersion.filter({ inquiry_id: id }, 'version', 50);
    const warrants = await base44.entities.Warrant.list('-created_date', 200);
    const reviews = await base44.entities.Review.filter({ inquiry_id: id }, '-created_date', 50);
    const corrections = await base44.entities.CorrectionEvent.filter({ inquiry_id: id }, '-created_date', 50);
    const debates = await base44.entities.Debate.filter({ inquiry_id: id }, '-created_date', 50);
    const audits = await base44.entities.AuditLog.list('-created_date', 200);
    const wMap = new Map(warrants.map((w) => [w.id, w]));
    const relIds = new Set([id, ...versions.map((v) => v.id), ...warrants.map((w) => w.id)]);
    const relAudits = audits.filter((a) => relIds.has(a.entity_id));
    const nodes = versions.map((v) => {
      const warrant = wMap.get(v.warrant_id) || null;
      const trust = computeTrustworthyRate(v.metrics, warrant);
      const cap = assessCapability(inquiry.stakes_level, trust, warrant);
      const review = reviews.find((r) => r.answer_version_id === v.id) || null;
      const correction = corrections.find((c) => c.to_version_id === v.id) || null;
      const debate = debates.find((d) => d.answer_version_id === v.id) || null;
      return { version: v, warrant, trust, cap, review, correction, debate };
    });
    setTree({ inquiry, nodes, audits: relAudits, debates });
  }

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-24">
          <div className="w-7 h-7 border-2 border-white/20 border-t-emerald-400 rounded-full animate-spin" />
        </div>
      </AppShell>
    );
  }

  const inq = tree?.inquiry;

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="font-heading text-xl font-semibold text-white">Truth Lineage</h1>
          <p className="text-sm text-slate-500">Explorable provenance: inquiry → answer versions → warrants → sources.</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-4">
          <label className="text-[11px] uppercase tracking-wider text-slate-500 mb-1.5 block">Inquiry</label>
          <ResponsiveSelect
            value={inq?.id || undefined}
            onValueChange={(v) => build(v)}
            options={inquiries.map((i) => ({ value: i.id, label: `${i.domain} · ${i.prompt.slice(0, 50)}` }))}
            placeholder="No inquiries yet"
            triggerClassName="w-full sm:w-auto h-9 rounded-lg border border-white/10 bg-[#070A0F] px-3 text-sm text-slate-200"
          />
        </div>

        {!inq && (
          <EmptyState
            icon={GitBranch}
            title="No lineage yet"
            message="Generate a warranted answer in the Console and its full truth lineage — inquiry, answer versions, warrants, and sources — will appear here."
            actionTo="/"
            actionLabel="Open the Console"
            actionIcon={MessageSquare}
          />
        )}

        {inq && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5">
            <div className="flex items-center gap-2 mb-1">
              <GitBranch className="h-4 w-4 text-emerald-400" />
              <span className="text-[11px] uppercase tracking-wider text-slate-500">Inquiry</span>
              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/5 text-slate-400">{inq.stakes_level}</span>
              <span className="text-[10px] text-slate-600">{inq.domain}</span>
              {inq.status === 'review' && <span className="text-[10px] text-rose-300">· blocked</span>}
            </div>
            <p className="text-sm text-slate-200">{inq.prompt}</p>

            {tree.nodes.length > 0 && (
              <div className="mt-4">
                <SignatureChain
                  version={tree.nodes[tree.nodes.length - 1].version}
                  warrant={tree.nodes[tree.nodes.length - 1].warrant}
                  inquiry={inq}
                  review={tree.nodes[tree.nodes.length - 1].review}
                  audits={tree.audits}
                />
              </div>
            )}

            <div className="mt-5 space-y-5">
              {tree.nodes.map(({ version, warrant, trust, cap, review, correction, debate }) => (
                <Node key={version.id} icon={ScrollText} tone="bg-indigo-400" label={`Answer v${version.version}`}>
                  <div className="rounded-lg bg-white/[0.03] border border-white/5 p-3">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${cap.bg} ${cap.text}`}>{cap.key} · {cap.label}</span>
                      <span className="text-[11px] text-slate-400">trust {trust}</span>
                      {review && <span className={`text-[10px] px-1.5 py-0.5 rounded ${review.status === 'killed' ? 'bg-rose-400/10 text-rose-300' : review.status === 'approved' ? 'bg-emerald-400/10 text-emerald-300' : 'bg-orange-400/10 text-orange-300'}`}>{review.status}</span>}
                      {correction && <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-400/10 text-indigo-300">corrected v{correction.from_version}→v{correction.to_version}</span>}
                      <span className="text-[10px] text-slate-600 ml-auto">{formatDistanceToNow(new Date(version.created_date), { addSuffix: true })}</span>
                    </div>
                    <p className="text-xs text-slate-400 line-clamp-2">{version.answer_text}</p>
                  </div>

                  {debate && <DebateTimeline inquiry={inq} debate={debate} />}

                  {warrant && (
                    <div className="mt-3">
                      <Node icon={ShieldCheck} tone="bg-emerald-400" label="Warrant">
                        <div className="rounded-lg bg-emerald-400/[0.03] border border-emerald-400/10 p-3">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${VALIDITY_STYLES[warrant.validity_status]?.bg || 'bg-white/5'} ${VALIDITY_STYLES[warrant.validity_status]?.text || 'text-slate-300'}`}>
                              {VALIDITY_STYLES[warrant.validity_status]?.label || warrant.validity_status}
                            </span>
                            <span className="text-[11px] text-slate-400">conf {Math.round((warrant.confidence_score || 0) * 100)}%</span>
                            <span className="text-[11px] text-slate-500">· revalidate {timeUntilExpiry(warrant.expiry_date).label}</span>
                          </div>
                          <p className="text-xs text-slate-300 mb-2">{warrant.conclusion}</p>
                          <ul className="space-y-1 mb-2">
                            {(warrant.premises || []).map((p, i) => (
                              <li key={i} className="text-[11px] text-slate-400 flex gap-1.5">
                                <span className="text-emerald-400/60 font-mono">P{i + 1}</span>{p}
                              </li>
                            ))}
                          </ul>
                          {(warrant.sources || []).length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {(warrant.sources || []).map((s, i) => (
                                <span key={i} className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-slate-400">
                                  <Link2 className="h-2.5 w-2.5" />{s}
                                </span>
                              ))}
                            </div>
                          )}
                          {warrant.signed_hash && (
                            <div className="flex items-center gap-1 mt-2 text-[10px] text-slate-600 font-mono break-all">
                              <Hash className="h-3 w-3 shrink-0" />{warrant.signed_hash}
                            </div>
                          )}
                        </div>
                      </Node>
                    </div>
                  )}
                </Node>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </AppShell>
  );
}