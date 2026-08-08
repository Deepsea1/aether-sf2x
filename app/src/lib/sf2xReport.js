import { jsPDF } from 'jspdf';

const avg = (arr) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null);

export async function loadReportData(base44, customerId, days = 30) {
  const sinceMs = Date.now() - days * 86400000;
  const inWindow = (r) => new Date(r.created_date || r.question_date || '').getTime() >= sinceMs;

  const [inquiries, allAnswers, allWarrants, corrections, benchRuns] = await Promise.all([
    base44.entities.Inquiry.filter({ customer_id: customerId }, '-created_date', 500),
    base44.entities.AnswerVersion.list('-created_date', 1000),
    base44.entities.Warrant.list('-created_date', 1000),
    base44.entities.CorrectionEvent.list('-created_date', 1000),
    base44.entities.ModelBenchRun.list('-created_date', 500),
  ]);

  const inquiryIds = new Set(inquiries.map((i) => i.id));
  const answers = allAnswers.filter((a) => inquiryIds.has(a.inquiry_id));
  const recentInquiries = inquiries.filter(inWindow);
  const recentAnswers = answers.filter(inWindow);
  const answerIds = new Set(answers.map((a) => a.id));
  const warrants = allWarrants.filter((w) => answerIds.has(w.answer_version_id));
  const custCorrections = corrections.filter((c) => inquiryIds.has(c.inquiry_id));
  const recentBench = benchRuns.filter(inWindow);

  const trustScores = recentAnswers.map((a) => a.trust_score).filter((v) => v != null);
  const validWarrants = warrants.filter((w) => w.validity_status === 'valid').length;
  const mttc = custCorrections.map((c) => c.time_to_correction).filter((v) => v != null);

  // Global arena model performance within the window
  const byModel = {};
  for (const r of recentBench) {
    const key = r.model_label || r.model;
    if (!byModel[key]) byModel[key] = { label: key, trust: [], correct: [], wins: 0, runs: 0, latency: [] };
    const b = byModel[key];
    b.trust.push(r.trust_score || 0);
    if (r.correctness != null) b.correct.push(r.correctness);
    if (r.is_winner) b.wins++;
    b.runs++;
    if (r.latency_ms) b.latency.push(r.latency_ms);
  }
  const modelRows = Object.values(byModel).map((b) => ({
    label: b.label,
    trust: avg(b.trust),
    correct: b.correct.length ? avg(b.correct) : null,
    winRate: b.runs ? b.wins / b.runs : 0,
    latency: b.latency.length ? avg(b.latency) : null,
    runs: b.runs,
  })).sort((a, b) => (b.correct ?? -1) - (a.correct ?? -1) || b.trust - a.trust);

  return {
    days,
    inquiries,
    recentInquiries,
    answers,
    warrants,
    corrections: custCorrections,
    modelRows,
    metrics: {
      totalInquiries: recentInquiries.length,
      answered: recentInquiries.filter((i) => i.status === 'answered').length,
      avgTrust: avg(trustScores),
      warrantValidity: warrants.length ? validWarrants / warrants.length : null,
      warrantCoverage: answers.length ? warrants.length / answers.length : null,
      correctionRate: answers.length ? custCorrections.length / answers.length : null,
      mttc: avg(mttc),
      totalWarrants: warrants.length,
      validWarrants,
    },
  };
}

export function buildTrustPdf(report, customer) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 48;
  let y = 56;

  const ensure = (need) => {
    if (y + need > H - 40) { doc.addPage(); y = 56; }
  };

  // Header band
  doc.setFillColor(7, 10, 15);
  doc.rect(0, 0, W, 6, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(22, 22, 22);
  doc.text('SF2X — Epistemic Trust Report', M, y);
  y += 20;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(110, 110, 110);
  doc.text(`Customer: ${customer.label}`, M, y); y += 14;
  doc.text(`Generated: ${new Date().toLocaleString()}`, M, y); y += 14;
  doc.text(`Period: last ${report.days} days`, M, y); y += 22;

  const sectionTitle = (title) => {
    ensure(30);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(22, 22, 22);
    doc.text(title, M, y); y += 6;
    doc.setDrawColor(220); doc.setLineWidth(0.5); doc.line(M, y, W - M, y); y += 16;
  };

  // Executive Summary
  sectionTitle('Executive Summary');
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(60, 60, 60);
  const m = report.metrics;
  const pct = (v) => (v == null ? '—' : (v * 100).toFixed(0) + '%');
  const rows = [
    ['Total Inquiries', String(m.totalInquiries)],
    ['Answered', `${m.answered} / ${m.totalInquiries}`],
    ['Avg Trust Score', m.avgTrust != null ? m.avgTrust.toFixed(1) + ' / 100' : '—'],
    ['Warrant Validity', pct(m.warrantValidity)],
    ['Warrant Coverage', pct(m.warrantCoverage)],
    ['Correction Rate', m.correctionRate != null ? (m.correctionRate * 100).toFixed(1) + '%' : '—'],
    ['Mean Time to Correction', m.mttc != null ? m.mttc.toFixed(0) + 's' : '—'],
    ['Warrants (valid / total)', `${m.validWarrants} / ${m.totalWarrants}`],
  ];
  for (const [k, v] of rows) {
    ensure(18);
    doc.text(k, M, y);
    doc.text(v, W - M, y, { align: 'right' });
    y += 16;
  }
  y += 10;

  // Model Performance table
  sectionTitle('Model Performance (Arena)');
  const colX = { model: M, trust: M + 200, correct: M + 280, win: M + 350, latency: W - M };
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(90, 90, 90);
  doc.text('Model', colX.model, y);
  doc.text('Trust', colX.trust, y, { align: 'right' });
  doc.text('Correct', colX.correct, y, { align: 'right' });
  doc.text('Win %', colX.win, y, { align: 'right' });
  doc.text('Latency', colX.latency, y, { align: 'right' });
  y += 6;
  doc.setDrawColor(230); doc.line(M, y, W - M, y); y += 12;
  doc.setFont('helvetica', 'normal'); doc.setTextColor(50, 50, 50);
  if (!report.modelRows.length) {
    doc.text('No arena runs in this period.', M, y); y += 14;
  } else {
    for (const r of report.modelRows) {
      ensure(20);
      doc.text(String(r.label).slice(0, 32), colX.model, y);
      doc.text(r.trust != null ? r.trust.toFixed(0) : '—', colX.trust, y, { align: 'right' });
      doc.text(r.correct != null ? (r.correct * 100).toFixed(0) + '%' : '—', colX.correct, y, { align: 'right' });
      doc.text((r.winRate * 100).toFixed(0) + '%', colX.win, y, { align: 'right' });
      doc.text(r.latency != null ? r.latency.toFixed(0) + 'ms' : '—', colX.latency, y, { align: 'right' });
      y += 16;
    }
  }
  y += 10;

  // Recent inquiries
  sectionTitle('Recent Inquiries');
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(50, 50, 50);
  if (!report.recentInquiries.length) {
    doc.text('No inquiries in this period.', M, y); y += 14;
  } else {
    for (const inq of report.recentInquiries.slice(0, 12)) {
      ensure(28);
      const trust = report.answers.find((a) => a.inquiry_id === inq.id)?.trust_score;
      const txt = doc.splitTextToSize(inq.prompt || '', 380);
      doc.text(txt.slice(0, 2), M, y);
      doc.setFont('helvetica', 'bold');
      doc.text(trust != null ? trust.toFixed(0) + '/100' : '—', W - M, y, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      y += Math.max(16, txt.slice(0, 2).length * 12) + 4;
    }
  }

  // Footer on every page
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(140, 140, 140);
    doc.text('AETHER by SF2X · Epistemic Operating System', M, H - 20);
    doc.text(`Page ${i} of ${pages}`, W - M, H - 20, { align: 'right' });
  }

  const stamp = `${(customer.email || customer.label || 'customer').replace(/[^a-z0-9]/gi, '_')}_trust_report`;
  doc.save(`${stamp}.pdf`);
}