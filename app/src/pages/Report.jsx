import React, { useEffect, useMemo, useState } from 'react';
import { FileText, Download, Loader2, ShieldCheck, Activity, Scale, Timer } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import AppShell from '@/components/sf2x/AppShell';
import StatCard from '@/components/sf2x/StatCard';
import ResponsiveSelect from '@/components/sf2x/ResponsiveSelect';
import { loadReportData, buildTrustPdf } from '@/lib/sf2xReport';

const PERIODS = [
  { value: 30, label: 'Last 30 days' },
  { value: 60, label: 'Last 60 days' },
  { value: 90, label: 'Last 90 days' },
  { value: 3650, label: 'All time' },
];

export default function Report() {
  const [me, setMe] = useState(null);
  const [users, setUsers] = useState([]);
  const [customerId, setCustomerId] = useState('');
  const [days, setDays] = useState(30);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [building, setBuilding] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const u = await base44.auth.me();
        setMe(u);
        if (u.role === 'admin') {
          const list = await base44.entities.User.list();
          setUsers(list || []);
          setCustomerId(list?.[0]?.id || u.id);
        } else {
          setCustomerId(u.id);
        }
      } catch (e) {
        setErr(e?.message || 'Failed to load user');
      }
    })();
  }, []);

  const customer = useMemo(() => {
    if (!me) return { label: '', email: '' };
    if (me.role === 'admin') {
      const u = users.find((x) => x.id === customerId) || me;
      return { label: u.full_name || u.email || u.id, email: u.email || '' };
    }
    return { label: me.full_name || me.email || me.id, email: me.email || '' };
  }, [me, users, customerId]);

  async function generate() {
    if (!customerId) return;
    setLoading(true); setErr(null); setReport(null);
    try {
      const r = await loadReportData(base44, customerId, days);
      setReport(r);
    } catch (e) {
      setErr(e?.message || 'Failed to build report');
    } finally {
      setLoading(false);
    }
  }

  async function downloadPdf() {
    if (!report) return;
    setBuilding(true);
    try {
      buildTrustPdf(report, customer);
    } catch (e) {
      setErr(e?.message || 'PDF generation failed');
    } finally {
      setBuilding(false);
    }
  }

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-semibold text-white">Customer Trust Report</h1>
        <p className="text-sm text-slate-400 mt-1">Summarize a customer's model performance and trust metrics, then export a shareable PDF.</p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5 mb-6">
        <div className="flex flex-col sm:flex-row gap-4 sm:items-end">
          <div className="flex-1">
            <label className="block text-xs uppercase tracking-[0.14em] text-slate-500 mb-1.5">Customer</label>
            {me?.role === 'admin' ? (
              <ResponsiveSelect
                value={customerId}
                onValueChange={setCustomerId}
                options={users.map((u) => ({ value: u.id, label: u.full_name || u.email || u.id }))}
                placeholder="Customer"
                triggerClassName="w-full rounded-lg bg-[#070A0F] border-white/10 text-slate-200 text-sm px-3 py-2"
              />
            ) : (
              <div className="text-sm text-slate-300 px-3 py-2 rounded-lg bg-[#070A0F] border border-white/10">{customer.label}</div>
            )}
          </div>
          <div className="sm:w-48">
            <label className="block text-xs uppercase tracking-[0.14em] text-slate-500 mb-1.5">Period</label>
            <ResponsiveSelect
              value={String(days)}
              onValueChange={(v) => setDays(Number(v))}
              options={PERIODS.map((p) => ({ value: String(p.value), label: p.label }))}
              placeholder="Period"
              triggerClassName="w-full rounded-lg bg-[#070A0F] border-white/10 text-slate-200 text-sm px-3 py-2"
            />
          </div>
          <button
            onClick={generate}
            disabled={loading || !customerId}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-400 px-4 py-2 text-sm font-medium text-[#070A0F] hover:opacity-90 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
            Generate
          </button>
        </div>
        {err && <div className="mt-4 text-sm text-rose-300">{err}</div>}
      </div>

      {report && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard label="Total Inquiries" value={report.metrics.totalInquiries} accent="emerald" icon={Activity} />
            <StatCard label="Avg Trust" value={report.metrics.avgTrust != null ? report.metrics.avgTrust.toFixed(0) : '—'} suffix="/100" accent="teal" icon={ShieldCheck} />
            <StatCard label="Warrant Validity" value={report.metrics.warrantValidity != null ? (report.metrics.warrantValidity * 100).toFixed(0) + '%' : '—'} accent="sky" icon={Scale} />
            <StatCard label="MTTC" value={report.metrics.mttc != null ? report.metrics.mttc.toFixed(0) + 's' : '—'} accent="slate" icon={Timer} />
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-heading text-sm font-semibold text-white uppercase tracking-[0.12em]">Model Performance (Arena)</h2>
              <button
                onClick={downloadPdf}
                disabled={building}
                className="inline-flex items-center gap-2 rounded-lg border border-emerald-400/40 bg-emerald-400/10 px-3.5 py-2 text-sm font-medium text-emerald-300 hover:bg-emerald-400/20 disabled:opacity-50"
              >
                {building ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Download PDF
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-[0.12em] text-slate-500 border-b border-white/10">
                    <th className="py-2 pr-4 font-medium">Model</th>
                    <th className="py-2 px-4 font-medium text-right">Trust</th>
                    <th className="py-2 px-4 font-medium text-right">Correctness</th>
                    <th className="py-2 px-4 font-medium text-right">Win %</th>
                    <th className="py-2 px-4 font-medium text-right">Latency</th>
                    <th className="py-2 pl-4 font-medium text-right">Runs</th>
                  </tr>
                </thead>
                <tbody>
                  {report.modelRows.length === 0 ? (
                    <tr><td colSpan={6} className="py-6 text-center text-slate-500">No arena runs in this period.</td></tr>
                  ) : report.modelRows.map((r) => (
                    <tr key={r.label} className="border-b border-white/5 text-slate-300">
                      <td className="py-2.5 pr-4">{r.label}</td>
                      <td className="py-2.5 px-4 text-right">{r.trust != null ? r.trust.toFixed(0) : '—'}</td>
                      <td className="py-2.5 px-4 text-right">{r.correct != null ? (r.correct * 100).toFixed(0) + '%' : '—'}</td>
                      <td className="py-2.5 px-4 text-right">{(r.winRate * 100).toFixed(0)}%</td>
                      <td className="py-2.5 px-4 text-right">{r.latency != null ? r.latency.toFixed(0) + 'ms' : '—'}</td>
                      <td className="py-2.5 pl-4 text-right text-slate-500">{r.runs}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-5">
            <h2 className="font-heading text-sm font-semibold text-white uppercase tracking-[0.12em] mb-4">Recent Inquiries</h2>
            {report.recentInquiries.length === 0 ? (
              <p className="text-sm text-slate-500">No inquiries in this period.</p>
            ) : (
              <ul className="space-y-2.5">
                {report.recentInquiries.slice(0, 10).map((inq) => {
                  const trust = report.answers.find((a) => a.inquiry_id === inq.id)?.trust_score;
                  return (
                    <li key={inq.id} className="flex items-start justify-between gap-4 text-sm border-b border-white/5 pb-2.5">
                      <span className="text-slate-300 flex-1">{inq.prompt}</span>
                      <span className={`shrink-0 font-medium ${trust != null && trust < 60 ? 'text-amber-300' : 'text-emerald-300'}`}>
                        {trust != null ? trust.toFixed(0) + '/100' : '—'}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}

      {!report && !loading && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <FileText className="h-10 w-10 text-slate-600 mb-3" />
          <p className="text-sm text-slate-500">Select a customer and period, then generate a report.</p>
        </div>
      )}
    </AppShell>
  );
}