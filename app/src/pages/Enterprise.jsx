import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Briefcase, Loader2, ShieldCheck, FileDown, Boxes, AlertTriangle, Activity, Server, Gavel, Download } from 'lucide-react';
import AppShell from '@/components/sf2x/AppShell';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';

// Enterprise governance console. Admin-only (the evidence-pack backend function
// enforces admin; the page gates client-side for UX). Org-level overview +
// audit evidence-pack generator (downloadable JSON / CSV) for any warrant or
// inquiry — everything a third-party auditor needs in one signed, verifiable record.

export default function Enterprise() {
  const [user, setUser] = useState(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [stats, setStats] = useState(null);
  const [systems, setSystems] = useState([]);
  const [recent, setRecent] = useState([]);
  const [loadingData, setLoadingData] = useState(true);

  const [subject, setSubject] = useState('');
  const [mode, setMode] = useState('warrant');
  const [pack, setPack] = useState(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const me = await base44.auth.me();
        setUser(me);
      } catch { setUser(null); }
      finally { setLoadingUser(false); }
    })();
  }, []);

  useEffect(() => {
    if (user?.role !== 'admin') { setLoadingData(false); return; }
    (async () => {
      try {
        const [sys, warrants, reviews, avs] = await Promise.all([
          base44.entities.AISystem.list('-created_date', 200),
          base44.entities.Warrant.list('-created_date', 200),
          base44.entities.Review.filter({ status: 'pending' }, '-created_date', 100),
          base44.entities.AnswerVersion.list('-created_date', 100),
        ]);
        setSystems(sys || []);
        setRecent((warrants || []).slice(0, 12));
        const avg = (avs || []).length ? Math.round(avs.reduce((s, a) => s + (a.trust_score || 0), 0) / avs.length) : 0;
        setStats({
          systems: (sys || []).length,
          byLifecycle: countBy(sys, 'lifecycle_state'),
          openReviews: (reviews || []).length,
          warrants: (warrants || []).length,
          avgTrust: avg,
          withEvidence: (warrants || []).filter((w) => (w.source_snapshots || []).length > 0).length,
        });
      } catch (e) {
        toast({ title: 'Failed to load', description: e?.message, variant: 'destructive' });
      } finally { setLoadingData(false); }
    })();
  }, [user]);

  const generate = async (kindArg, valArg) => {
    const kind = kindArg || mode;
    const val = (valArg != null ? valArg : subject).trim();
    if (!val) return;
    setGenerating(true); setPack(null);
    try {
      const body = kind === 'inquiry' ? { inquiry_id: val } : { warrant_id: val };
      const res = await base44.functions.invoke('generateEvidencePack', body);
      setPack(res?.data?.pack || res?.pack || res);
    } catch (e) {
      toast({ title: 'Evidence pack failed', description: e?.message, variant: 'destructive' });
    } finally { setGenerating(false); }
  };

  const download = (obj, filename) => {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const downloadAuditCsv = () => {
    if (!pack?.audit_log?.length) return;
    const rows = [['event_type', 'summary', 'actor_id', 'created_date']];
    pack.audit_log.forEach((a) => rows.push([a.event_type, (a.summary || '').replace(/"/g, '""'), a.actor_id || '', a.created_date]));
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `evidence-${pack.subject.warrant_id || pack.subject.inquiry_id}-audit.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  if (loadingUser) return <AppShell><div className="flex items-center justify-center py-20 text-slate-500"><Loader2 className="h-6 w-6 animate-spin" /></div></AppShell>;
  if (user?.role !== 'admin') {
    return (
      <AppShell>
        <div className="max-w-xl mx-auto text-center py-20">
          <Briefcase className="h-8 w-8 text-slate-500 mx-auto mb-3" />
          <h1 className="font-heading text-xl font-semibold text-white">Admin only</h1>
          <p className="text-sm text-slate-400 mt-1">The enterprise governance console requires an admin account.</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-emerald-400/80 mb-2">
            <Briefcase className="h-3.5 w-3.5" /> Enterprise
          </div>
          <h1 className="font-heading text-2xl font-semibold text-white">Audit</h1>
          <p className="text-sm text-slate-400 mt-1.5">Org-wide epistemic posture and downloadable audit evidence packs for any warranted decision.</p>
        </div>

        {/* Overview */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          <Stat icon={Server} label="AI systems" value={stats?.systems ?? '—'} to="/systems" />
          <Stat icon={Gavel} label="Open reviews" value={stats?.openReviews ?? '—'} tone={stats?.openReviews > 0 ? 'amber' : ''} to="/governance" />
          <Stat icon={ShieldCheck} label="Warrants" value={stats?.warrants ?? '—'} to="/lineage" />
          <Stat icon={Activity} label="Avg trust" value={stats?.avgTrust != null ? stats.avgTrust : '—'} to="/health" />
          <Stat icon={Boxes} label="Evidence preserved" value={stats?.withEvidence ?? '—'} to="/evidence" />
          <Stat icon={AlertTriangle} label="Degraded systems" value={stats?.byLifecycle?.degraded || 0} tone={stats?.byLifecycle?.degraded > 0 ? 'rose' : ''} to="/systems" />
        </div>

        {systems.length > 0 && (
          <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5 mb-6">
            <div className="text-sm font-medium text-white mb-3">Registered AI systems</div>
            <div className="space-y-2">
              {systems.slice(0, 8).map((s) => (
                <Link key={s.id} to="/systems" className="flex items-center justify-between text-sm rounded-lg px-2 py-1.5 -mx-2 hover:bg-white/[0.03] transition-colors">
                  <div className="min-w-0">
                    <span className="text-slate-200">{s.name}</span>
                    <span className="text-slate-600 ml-2">· {s.domain || 'general'}</span>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${lifecycleTone(s.lifecycle_state)}`}>{s.lifecycle_state}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Evidence pack generator */}
        <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5 mb-6">
          <div className="flex items-center gap-2 mb-1">
            <FileDown className="h-4 w-4 text-emerald-400" />
            <div className="text-sm font-medium text-white">Generate an audit evidence pack</div>
          </div>
          <p className="text-[12px] text-slate-500 mb-4">Enter a warrant id or inquiry id. The pack assembles the full signed decision record — inquiry, answer, warrant, preserved evidence, signature verification, debate, review, audit log, and telemetry — for an auditor or regulator.</p>
          <div className="flex items-center gap-2 mb-3">
            <button onClick={() => setMode('warrant')} className={`text-xs px-3 py-1 rounded-full border transition-colors ${mode === 'warrant' ? 'border-emerald-400/50 bg-emerald-400/10 text-emerald-200' : 'border-white/10 text-slate-400 hover:border-white/20'}`}>Warrant id</button>
            <button onClick={() => setMode('inquiry')} className={`text-xs px-3 py-1 rounded-full border transition-colors ${mode === 'inquiry' ? 'border-emerald-400/50 bg-emerald-400/10 text-emerald-200' : 'border-white/10 text-slate-400 hover:border-white/20'}`}>Inquiry id</button>
          </div>
          <div className="flex gap-2">
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={mode === 'warrant' ? 'warrant id…' : 'inquiry id…'} className="font-mono text-sm" onKeyDown={(e) => e.key === 'Enter' && generate()} />
            <Button onClick={() => generate()} disabled={generating || !subject.trim()} className="shrink-0">
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />} Generate
            </Button>
          </div>

          {pack && (
            <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-4">
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <span className={`inline-flex items-center gap-1 text-sm ${pack.signature?.valid ? 'text-emerald-300' : 'text-rose-300'}`}>
                  <ShieldCheck className="h-4 w-4" /> {pack.signature?.valid ? 'Signature verified' : 'Signature invalid'}
                </span>
                <span className="text-[11px] text-slate-500 font-mono">{pack.signature?.scheme}</span>
                <div className="ml-auto flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => download(pack, `evidence-pack-${pack.subject.warrant_id || pack.subject.inquiry_id}.json`)}>
                    <Download className="h-3.5 w-3.5" /> JSON
                  </Button>
                  <Button size="sm" variant="outline" onClick={downloadAuditCsv} disabled={!pack.audit_log?.length}>
                    <Download className="h-3.5 w-3.5" /> Audit CSV
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <Pack label="Warrant" value={pack.warrant?.validity_status || '—'} />
                <Pack label="Trust" value={pack.answer_version?.trust_score != null ? pack.answer_version.trust_score : '—'} />
                <Pack label="Evidence snapshots" value={pack.evidence_snapshots?.length || 0} />
                <Pack label="Audit events" value={pack.audit_log?.length || 0} />
                <Pack label="Debates" value={pack.debates?.length || 0} />
                <Pack label="Reviews" value={pack.reviews?.length || 0} />
                <Pack label="Telemetry spans" value={pack.telemetry_span_count || 0} />
                <Pack label="Generated" value={pack.generated_at ? new Date(pack.generated_at).toLocaleString() : '—'} />
              </div>
              {pack.answer_version && (
                <div className="mt-3">
                  <div className="text-[10px] uppercase tracking-wider text-slate-600 mb-1">Answer (excerpt)</div>
                  <div className="text-[12px] text-slate-400 max-h-32 overflow-y-auto whitespace-pre-wrap border border-white/5 rounded-lg p-2 bg-black/40">{(pack.answer_version.answer_text || '').slice(0, 600)}…</div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Recent warrants */}
        <div className="rounded-2xl border border-white/10 bg-[#0B0F16] overflow-hidden">
          <div className="px-5 py-3 border-b border-white/5 text-sm font-medium text-white">Recent warrants — generate pack</div>
          {loadingData ? <div className="py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-slate-500" /></div> : (
            <div className="divide-y divide-white/5">
              {recent.map((w) => (
                <Link key={w.id} to={`/scorecard/${w.id}`} className="px-5 py-2.5 flex items-center gap-3 text-xs hover:bg-white/[0.02] transition-colors">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${w.validity_status === 'valid' ? 'bg-emerald-400' : w.validity_status === 'weak' ? 'bg-amber-400' : 'bg-rose-400'}`} />
                  <span className="font-mono text-slate-400 truncate flex-1">{w.id}</span>
                  <span className="text-slate-500 tabular-nums">{new Date(w.created_date).toLocaleDateString()}</span>
                  {(w.source_snapshots || []).length > 0 && <span className="text-emerald-400/70 text-[10px]">📷 {(w.source_snapshots).length}</span>}
                  <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setSubject(w.id); setMode('warrant'); generate('warrant', w.id); }} className="text-emerald-300/80 hover:text-emerald-300 text-[11px]">pack →</button>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function countBy(list, key) {
  const m = {};
  (list || []).forEach((x) => { const k = x[key] || 'unknown'; m[k] = (m[k] || 0) + 1; });
  return m;
}

function lifecycleTone(s) {
  if (s === 'approved' || s === 'monitored') return 'bg-emerald-400/15 text-emerald-300';
  if (s === 'degraded' || s === 'suspended') return 'bg-rose-400/15 text-rose-300';
  if (s === 'retired') return 'bg-slate-500/15 text-slate-400';
  return 'bg-amber-400/15 text-amber-300';
}

function Stat({ icon: Icon, label, value, tone, to }) {
  const t = tone === 'rose' ? 'text-rose-300' : tone === 'amber' ? 'text-amber-300' : 'text-white';
  const inner = (
    <div className="rounded-xl border border-white/10 bg-[#0B0F16] p-3 transition-colors hover:border-white/20 hover:bg-white/[0.03] h-full">
      <Icon className="h-4 w-4 text-slate-500 mb-1.5" />
      <div className={`text-xl font-semibold tabular-nums ${t}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-slate-600 mt-0.5">{label}</div>
    </div>
  );
  return to ? <Link to={to} className="block">{inner}</Link> : inner;
}

function Pack({ label, value }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wider text-slate-600">{label}</div>
      <div className="text-slate-200 mt-0.5">{value}</div>
    </div>
  );
}