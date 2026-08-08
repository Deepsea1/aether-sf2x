import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { requireAdmin } from '../../shared/auth.js';
import { ALL_MODELS } from '../../shared/sf2xBench.js';

// Appends SF2X Model Arena bench runs into a Google Sheet so performance trends
// accumulate over time. Idempotent: skips runs whose id is already in the sheet,
// so the daily workflow (or a replay) never produces duplicate rows.

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const SHEET_TITLE = 'SF2X Bench Trends';
const SHEET_NAME = 'Model Bench Runs';
const HEADERS = [
  'Run ID', 'Created', 'Question Date', 'Run Type', 'Question',
  'Model', 'Model Label', 'Company', 'Answer',
  'Trust Score', 'Correctness (%)', 'Winner',
  'Warrant Validity', 'Warrant Confidence', 'Premises', 'Sources',
  'Latency (ms)', 'Verifier Notes', 'Error',
];

const TAG = new Map(ALL_MODELS.map((m) => [m.value, m.tag]));

function enc(s) { return encodeURIComponent(String(s)); }

async function sheetsJson(token, path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error('Sheets API ' + res.status + ': ' + t.slice(0, 300));
  }
  return res.json();
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;
    let body = {};
    try { body = await req.json(); } catch { body = {}; }

    const _auth = await requireAdmin(base44);
    if (!_auth.ok) return _auth.response;

    const { accessToken } = await svc.connectors.getConnection('googlesheets');

    // Gather runs. Daily workflow passes question_date + run_type; manual export dumps recent.
    let runs;
    if (body.question_date || body.run_type) {
      const q = {};
      if (body.question_date) q.question_date = body.question_date;
      if (body.run_type) q.run_type = body.run_type;
      runs = await svc.entities.ModelBenchRun.filter(q);
    } else {
      runs = await svc.entities.ModelBenchRun.list('-created_date', body.limit || 1000);
    }
    runs = (runs || []).filter(Boolean);

    // Find or create the trend spreadsheet.
    let spreadsheetId = body.spreadsheet_id;
    if (!spreadsheetId) {
      const driveRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${enc("name='" + SHEET_TITLE + "'")}&fields=files(id)&pageSize=1`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (driveRes.ok) {
        const dj = await driveRes.json();
        spreadsheetId = dj.files?.[0]?.id || null;
      }
    }

    let spreadsheetUrl = null;
    let created = false;
    if (!spreadsheetId) {
      const doc = await sheetsJson(accessToken, SHEETS_API, {
        method: 'POST',
        body: JSON.stringify({ properties: { title: SHEET_TITLE }, sheets: [{ properties: { title: SHEET_NAME } }] }),
      });
      spreadsheetId = doc.spreadsheetId;
      spreadsheetUrl = doc.spreadsheetUrl;
      created = true;
      await fetch(`${SHEETS_API}/${enc(spreadsheetId)}/values/${enc(SHEET_NAME)}!A1?valueInputOption=RAW`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: [HEADERS] }),
      });
    } else {
      const meta = await sheetsJson(accessToken, `${SHEETS_API}/${enc(spreadsheetId)}`);
      spreadsheetUrl = meta.spreadsheetUrl;
      // Ensure the header row exists (covers a manually created empty sheet).
      const hdrRes = await fetch(`${SHEETS_API}/${enc(spreadsheetId)}/values/${enc(SHEET_NAME)}!A1:Z1`, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (hdrRes.ok) {
        const hj = await hdrRes.json();
        if (!hj.values || !hj.values.length) {
          await fetch(`${SHEETS_API}/${enc(spreadsheetId)}/values/${enc(SHEET_NAME)}!A1?valueInputOption=RAW`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ values: [HEADERS] }),
          });
        }
      }
    }

    // Dedupe by Run ID (column A) — append only runs not already present.
    const existing = new Set();
    const colRes = await fetch(`${SHEETS_API}/${enc(spreadsheetId)}/values/${enc(SHEET_NAME)}!A2:A`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (colRes.ok) {
      const cj = await colRes.json();
      (cj.values || []).forEach((r) => { if (r && r[0]) existing.add(String(r[0])); });
    }
    const fresh = runs.filter((r) => r.id && !existing.has(String(r.id)));
    if (!fresh.length) {
      return Response.json({ status: 'ok', spreadsheet_id: spreadsheetId, spreadsheet_url: spreadsheetUrl, created, appended: 0, skipped: runs.length });
    }

    const rows = fresh.map((r) => [
      r.id,
      r.created_date || '',
      r.question_date || '',
      r.run_type || '',
      (r.question || '').slice(0, 500),
      r.model || '',
      r.model_label || '',
      TAG.get(r.model) || '',
      (r.answer_text || '').slice(0, 500),
      r.trust_score ?? '',
      r.correctness != null ? Math.round(r.correctness * 100) : '',
      r.is_winner ? 'Y' : '',
      r.warrant_summary?.validity || '',
      r.warrant_summary?.confidence ?? '',
      r.warrant_summary?.premises ?? '',
      r.warrant_summary?.sources ?? '',
      r.latency_ms ?? '',
      (r.verifier_notes || '').slice(0, 500),
      r.error || '',
    ]);

    const appendRes = await fetch(`${SHEETS_API}/${enc(spreadsheetId)}/values/${enc(SHEET_NAME)}!A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: rows }),
    });
    if (!appendRes.ok) {
      const t = await appendRes.text();
      throw new Error('append failed ' + appendRes.status + ': ' + t.slice(0, 300));
    }

    await svc.entities.AuditLog.create({
      event_type: 'answer_promoted',
      entity_type: 'ModelBenchRun',
      entity_id: fresh[0]?.id || '',
      summary: `Bench trends exported to Sheets — ${rows.length} run row(s) appended`,
      metadata: { spreadsheet_id: spreadsheetId, appended: rows.length, skipped: runs.length - rows.length },
    }).catch(() => {});

    return Response.json({
      status: 'ok',
      spreadsheet_id: spreadsheetId,
      spreadsheet_url: spreadsheetUrl,
      created,
      appended: rows.length,
      skipped: runs.length - rows.length,
    });
  } catch (error) {
    console.error('exportBenchToSheets error', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}