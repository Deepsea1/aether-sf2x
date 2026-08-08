import React, { useEffect, useState, useCallback, useRef } from 'react';
import { ShieldCheck, ShieldX, Clock, Flag, AlertTriangle, Download, Loader2, FlaskConical, Archive } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import AppShell from '@/components/sf2x/AppShell';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import StatCard from '@/components/sf2x/StatCard';
import EpistemicTrendChart from '@/components/sf2x/EpistemicTrendChart';
import ReviewRow from '@/components/sf2x/ReviewRow';
import AuditExplorer from '@/components/sf2x/AuditExplorer';
import { computeTrustworthyRate } from '@/lib/sf2x';
import { clusterReviews, CASE_RUBRIC } from '@/lib/sf2xReview';
import { regenerateAnswer } from '@/lib/sf2xRevise';
import AgentGreeter from '@/components/sf2x/AgentGreeter';

function ClusterGroup({ clusters, emptyText, emptyIcon: EmptyIcon, busy, onDecide, onPrepare }) {
  if (!clusters.length) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-10 text-center">
        <EmptyIcon className="h-5 w-5 text-slate-500 mx-auto mb-2" />
        <p className="text-sm text-slate-400">{emptyText}</p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {clusters.map((c) => (
        <div key={c.key}>
          {clusters.length > 1 && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-2 px-1">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500">{c.domain} · {c.mode.replace(/_/g, ' ')}</span>
              <span className="text-[10px] text-slate-600">· {c.count} item{c.count === 1 ? '' : 's'}</span>
              <span className="text-[10px] text-slate-600">· root: {c.rootCause}</span>
              <span className="text-[10px] text-slate-600">· fix: {c.sharedFix}</span>
            </div>
          )}
          <div className="space-y-3">
            {c.items.map((r) => (
              <ReviewRow
                key={r.review.id}
                review={r.review}
                version={r.version}
                inquiry={r.inquiry}
                warrant={r.warrant}
                correction={r.correction}
                candidateVersion={r.candidateVersion}
                busy={busy}
                onDecide={onDecide}
                onPrepare={onPrepare}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function GovernanceContent() {
  const [data, setData] = useState(null);
  const [audits, setAudits] = useState([]);
  const [audit, setAudit] = useState({ bench: [], tribunal: null, correlation: null });
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [sheetUrl, setSheetUrl] = useState(null);
  const [flash, setFlash] = useState(null);

  const load = useCallback(async () => {
    try {
      const [reviews, versions, inquiries, warrants, auditList, corrections, bench, tribunal, correlation] = await Promise.all([
        base44.entities.Review.list('-created_date', 100),
        base44.entities.AnswerVersion.list('-created_date', 200),
        base44.entities.Inquiry.list('-created_date', 200),
        base44.entities.Warrant.list('-created_date', 200),
        base44.entities.AuditLog.list('-created_date', 500),
        base44.entities.CorrectionEvent.list('-created_date', 200),
        base44.entities.BenchResult.list('-created_date', 20),
        base44.entities.TribunalLiftAudit.list('-created_date', 1).then((l) => l[0] || null),
        base44.entities.CorrelationAudit.list('-created_date', 1).then((l) => l[0] || null),
      ]);
      const corrMap = new Map(corrections.map((c) => [c.to_version_id, c]));
      const vMap = new Map(versions.map((v) => [v.id, v]));
      const iMap = new Map(inquiries.map((i) => [i.id, i]));
      const wMap = new Map(warrants.map((w) => [w.id, w]));
      const rows = reviews.map((rv) => {
        const version = vMap.get(rv.answer_version_id) || null;
        const warrant = wMap.get(version?.warrant_id) || null;
        const inquiry = iMap.get(rv.inquiry_id) || null;
        const trust = computeTrustworthyRate(version?.metrics, warrant);
        return {
          review: rv, version, inquiry, warrant, trust,
          correction: corrMap.get(rv.answer_version_id) || null,
          candidateVersion: vMap.get(rv.candidate_version_id) || null,
        };
      });
      const byInquiry = {};
      rows.forEach((r) => {
        if (r.review.status === 'pending') {
          (byInquiry[r.review.inquiry_id] = byInquiry[r.review.inquiry_id] || []).push(r);
        }
      });
      const dupIds = new Set();
      Object.values(byInquiry).forEach((group) => {
        if (group.length < 2) return;
        group.sort((a, b) => new Date(b.review.created_date) - new Date(a.review.created_date));
        group.slice(1).forEach((r) => dupIds.add(r.review.id));
      });
      if (dupIds.size) {
        dupIds.forEach((id) => {
          base44.entities.Review.update(id, { status: 'flagged', decision: 'auto-merged duplicate review', notes: 'Consolidated — a newer review for this inquiry already exists in the queue.' }).catch(() => {});
          base44.entities.AuditLog.create({ event_type: 'review_decision', entity_type: 'Review', entity_id: id, summary: 'Duplicate pending review auto-merged', metadata: { action: 'auto_merge' } }).catch(() => {});
        });
      }
      const dedupedRows = rows.filter((r) => !dupIds.has(r.review.id));
      const count = (s) => dedupedRows.filter((r) => r.review.status === s).length;
      setData({
        rows: dedupedRows,
        stats: { pending: count('pending'), approved: count('approved'), rejected: count('rejected'), flagged: count('flagged'), killed: count('killed') },
        trendVersions: dedupedRows.map((r) => ({ ...r.version, trust: r.trust })),
      });
      setAudits(auditList);
      setAudit({ bench, tribunal, correlation });
    } catch (e) {
      setError(e?.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    base44.auth.me().catch(() => null).then((u) => setUser(u));
    load();
  }, [load]);

  useEffect(() => {
    if (window.location.hash === '#review-queue') {
      const el = document.getElementById('review-queue');
      if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    }
  }, [loading]);

  const autoRanRef = useRef(false);
  useEffect(() => {
    if (loading || !data || autoRanRef.current || busy) return;
    const untested = (data.rows || []).filter((r) => r.review.status === 'pending' && !r.review.verdict);
    if (untested.length) { autoRanRef.current = true; prepareAll(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, data, busy]);

  async function prepare(review) {
    setBusy(`prep:${review.id}`);
    setError(null);
    setFlash({ tone: 'slate', text: 'Running the tribunal + verifier with stronger retrieval…' });
    try {
      const res = await base44.functions.invoke('prepareReview', { review_id: review.id });
      const d = res?.data || res;
      if (d?.error) { setError(d.error); setFlash(null); }
      else setFlash({ tone: d?.consensus === 'agreed' ? 'emerald' : 'slate', text: `Test complete: ${d?.consensus || 'done'}${d?.candidate_version_id ? ' — repaired candidate prepared' : ''}.` });
      await load();
    } catch (e) {
      setError(e?.message || 'Test failed');
      setFlash(null);
    } finally {
      setBusy(null);
    }
  }

  async function prepareAll() {
    const untested = (data?.rows || []).filter((r) => r.review.status === 'pending' && !r.review.verdict);
    if (!untested.length) return;
    setBusy('prep:all');
    setError(null);
    try {
      for (const r of untested) {
        try {
          const res = await base44.functions.invoke('prepareReview', { review_id: r.review.id });
          const d = res?.data || res;
          if (d?.error) setError(d.error);
        } catch (e) { setError(e?.message); }
      }
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function decide(review, status, notes) {
    setBusy(review.id);
    setError(null);
    setData((prev) => {
      if (!prev) return prev;
      const newRows = prev.rows.map((r) => (r.review.id === review.id ? { ...r, review: { ...r.review, status } } : r));
      const count = (s) => newRows.filter((r) => r.review.status === s).length;
      return { ...prev, rows: newRows, stats: { pending: count('pending'), approved: count('approved'), rejected: count('rejected'), flagged: count('flagged'), killed: count('killed') } };
    });
    try {
      const decision = status === 'approved'
        ? 'Promoted after human review'
        : status === 'rejected'
          ? 'Rejected by reviewer'
          : status === 'killed'
            ? 'Suppressed via kill-switch'
            : 'Flagged for follow-up';
      await base44.entities.Review.update(review.id, {
        status, reviewer_id: user?.id || null, decision,
        notes: notes || '', decided_date: new Date().toISOString(),
      });
      await base44.entities.AuditLog.create({
        event_type: status === 'killed' ? 'kill_switch' : 'review_decision',
        entity_type: 'Review', entity_id: review.id,
        summary: `${review.capability_level} review → ${status}${notes ? ' · ' + notes : ''}`,
        metadata: { status, review_id: review.id },
      });
      const row = (data?.rows || []).find((r) => r.review.id === review.id);
      if (status === 'rejected' || status === 'killed') {
        await base44.entities.Inquiry.update(review.inquiry_id, { status: 'review' }).catch(() => {});
        if (status === 'rejected') {
          if (review.candidate_version_id) {
            await base44.entities.Review.create({
              answer_version_id: review.candidate_version_id, inquiry_id: review.inquiry_id,
              capability_level: review.capability_level, status: 'pending',
              decision: 'Re-researched candidate answer — verify the correction', verdict: review.verdict || null,
            });
            await base44.entities.AuditLog.create({
              event_type: 'review_decision', entity_type: 'Review', entity_id: review.id,
              summary: `Rejected → re-researched candidate routed back to the queue`,
              metadata: { candidate_version_id: review.candidate_version_id, re_research: true },
            }).catch(() => {});
          } else if (row?.inquiry) {
            await base44.entities.AuditLog.create({
              event_type: 'review_decision', entity_type: 'Review', entity_id: review.id,
              summary: `Rejected → re-research triggered for inquiry`,
              metadata: { re_research: true, inquiry_id: review.inquiry_id },
            }).catch(() => {});
            try { await regenerateAnswer(row.inquiry); } catch (e) { setError(e?.message); }
          }
        }
      } else if (status === 'approved') {
        await base44.entities.Inquiry.update(review.inquiry_id, {
          status: 'answered',
          validated_answer: row?.version?.answer_text?.slice(0, 1000) || 'Approved after human review.',
        }).catch(() => {});
        await base44.entities.AuditLog.create({
          event_type: 'answer_promoted', entity_type: 'AnswerVersion', entity_id: review.answer_version_id,
          summary: `Answer archived after approval at ${review.capability_level} · trust ${row?.trust ?? 'n/a'}`,
          metadata: { archive: true, review_id: review.id, answer_version_id: review.answer_version_id, warrant_id: row?.version?.warrant_id || null, trust: row?.trust ?? null, reviewer_id: user?.id || null },
        }).catch(() => {});
      }
      await load();
    } catch (e) {
      setError(e?.message);
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function handleExport() {
    setExporting(true);
    setError(null);
    try {
      const res = await base44.functions.invoke('exportAuditToSheets', {});
      const d = res?.data || res;
      if (d?.error) { setError(d.error); return; }
      if (d?.spreadsheet_url) setSheetUrl(d.spreadsheet_url);
    } catch (e) {
      setError(e?.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-7 h-7 border-2 border-white/20 border-t-emerald-400 rounded-full animate-spin" />
      </div>
    );
  }

  const rows = data?.rows || [];
  const stats = data?.stats || { pending: 0, approved: 0, rejected: 0, flagged: 0, killed: 0 };
  const pending = rows.filter((r) => r.review.status === 'pending');
  const archive = rows.filter((r) => r.review.status !== 'pending');
  const untested = pending.filter((r) => !r.review.verdict);
  const activeClusters = pending.length ? clusterReviews(pending) : [];
  const archiveClusters = archive.length ? clusterReviews(archive) : [];
  const prepAllBusy = busy === 'prep:all';

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-xl font-semibold text-white">Governance</h1>
          <p className="text-sm text-slate-500">System audit, capability gates, review workflow, and the immutable audit trail.</p>
        </div>
        <Button variant="outline" disabled={exporting} onClick={handleExport} className="h-11 md:h-8 border-white/10 text-slate-300 hover:bg-white/5 hover:text-white shrink-0">
          {exporting ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-1.5" />} Export
        </Button>
      </div>

      {sheetUrl && (
        <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.04] p-3 text-xs text-emerald-200">
          Exported to Google Sheets — <a href={sheetUrl} target="_blank" rel="noreferrer" className="underline">{sheetUrl}</a>
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-rose-400/20 bg-rose-400/[0.04] p-3 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-rose-300 mt-0.5 shrink-0" />
          <p className="text-sm text-rose-200">{error}</p>
        </div>
      )}

      {flash && (
        <div className={`rounded-xl border px-3 py-2 text-xs ${flash.tone === 'emerald' ? 'border-emerald-400/20 bg-emerald-400/[0.05] text-emerald-200' : 'border-white/10 bg-white/[0.03] text-slate-300'}`}>
          {flash.text}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatCard icon={Clock} label="Pending" value={`${stats.pending}`} accent="orange" to="/governance#review-queue" />
        <StatCard icon={ShieldCheck} label="Approved" value={`${stats.approved}`} accent="emerald" to="/governance#review-queue" />
        <StatCard icon={AlertTriangle} label="Rejected" value={`${stats.rejected}`} accent="rose" to="/governance#review-queue" />
        <StatCard icon={Flag} label="Flagged" value={`${stats.flagged}`} accent="amber" to="/governance#review-queue" />
        <StatCard icon={ShieldX} label="Suppressed" value={`${stats.killed}`} accent="rose" to="/governance#review-queue" />
      </div>

      <div className="flex justify-end">
        <AgentGreeter
          agentKey="correction_event_explainer"
          to="/correction-explainer"
          firstGreeting="Hi! I'm the Correction Explainer. I can break down any correction event — what was wrong, what was fixed, and why. Click below and ask me about a review in the queue."
          returningGreeting="I'm here if you need help understanding a correction."
          label="Ask the correction explainer"
        />
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5">
        <div className="mb-3">
          <h3 className="text-sm font-medium text-slate-200">Epistemic Trend — Last 30 Days</h3>
          <p className="text-[11px] text-slate-500">Daily Trustworthy Answer Rate (solid) and key error metrics (dashed, lower is better)</p>
        </div>
        <EpistemicTrendChart versions={data?.trendVersions || []} />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div id="review-queue" className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-sm font-medium text-slate-300">Review Queue</h2>
            <Button size="sm" variant="outline" disabled={prepAllBusy || !untested.length} onClick={prepareAll}
              className="h-11 md:h-8 border-emerald-400/30 text-emerald-300 hover:bg-emerald-400/10">
              {prepAllBusy ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <FlaskConical className="h-3.5 w-3.5 mr-1.5" />}
              Run all tests {untested.length ? `(${untested.length})` : ''}
            </Button>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {CASE_RUBRIC.map((r) => (
                <span key={r.label} className="text-[11px] text-slate-500"><span className="text-slate-400">{r.label}:</span> {r.text}</span>
              ))}
            </div>
          </div>

          <Tabs defaultValue="active" className="w-full">
            <TabsList className="bg-white/[0.02] border border-white/10">
              <TabsTrigger value="active" className="min-h-[44px] md:min-h-0 data-[state=active]:bg-emerald-400/15 data-[state=active]:text-emerald-300">Active queue ({pending.length})</TabsTrigger>
              <TabsTrigger value="archive" className="min-h-[44px] md:min-h-0 data-[state=active]:bg-white/10 data-[state=active]:text-white"><Archive className="h-3.5 w-3.5 mr-1.5" />Audit archive ({archive.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="active" className="mt-4 space-y-4">
              <ClusterGroup
                clusters={activeClusters}
                emptyText="No answers are awaiting review. High-stakes or low-trust answers appear here with a verified candidate prepared automatically — just approve it."
                emptyIcon={ShieldCheck}
                busy={busy}
                onDecide={decide}
                onPrepare={prepare}
              />
            </TabsContent>
            <TabsContent value="archive" className="mt-4 space-y-4">
              <ClusterGroup
                clusters={archiveClusters}
                emptyText="No decided reviews yet. Approved and rejected answers are archived here for audit."
                emptyIcon={Archive}
                busy={busy}
                onDecide={decide}
                onPrepare={prepare}
              />
            </TabsContent>
          </Tabs>
        </div>

        <div>
          <h2 className="text-sm font-medium text-slate-300 mb-3">Audit Trail</h2>
          <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-4">
            <AuditExplorer audits={audits} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Governance() {
  return <AppShell><GovernanceContent /></AppShell>;
}