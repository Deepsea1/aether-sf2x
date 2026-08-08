import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { requireAdmin } from '../../shared/auth.js';

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const SHEET_TITLE = 'SF2X Weekly Audit Archive';
const GOV_TAB = 'Governance Decisions';
const CORR_TAB = 'Correction Events';
const GOV_HEADERS = ['Record ID', 'Timestamp', 'Event Type', 'Entity Type', 'Entity ID', 'Actor', 'Summary'];
const CORR_HEADERS = ['Record ID', 'Timestamp', 'Inquiry ID', 'From Version', 'To Version', 'Severity', 'Detected By', 'MTTC (s)', 'Trust Delta', 'Drift Score', 'Notes'];

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
  const txt = await res.text();
  return txt ? JSON.parse(txt) : {};
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    let body = {};
    try { body = await req.json(); } catch { body = {}; }

    const _auth = await requireAdmin(base44);
    if (!_auth.ok) return _auth.response;

    const svc = base44.asServiceRole;
    const { accessToken } = await svc.connectors.getConnection('googlesheets');

    const sinceMs = Date.now() - 7 * 86400000;
    const inWindow = (r) => new Date(r.created_date || '').getTime() >= sinceMs;
    const [allAudits, allCorrections] = await Promise.all([
      svc.entities.AuditLog.list('-created_date', 2000),
      svc.entities.CorrectionEvent.list('-created_date', 2000),
    ]);
    const audits = allAudits.filter(inWindow);
    const corrections = allCorrections.filter(inWindow);

    // Find or create the permanent archive spreadsheet (by name).
    let spreadsheetId = body.spreadsheet_id;
    let spreadsheetUrl = null;
    let created = false;
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
    if (!spreadsheetId) {
      const doc = await sheetsJson(accessToken, SHEETS_API, {
        method: 'POST',
        body: JSON.stringify({
          properties: { title: SHEET_TITLE },
          sheets: [
            { properties: { title: GOV_TAB } },
            { properties: { title: CORR_TAB } },
          ],
        }),
      });
      spreadsheetId = doc.spreadsheetId;
      spreadsheetUrl = doc.spreadsheetUrl;
      created = true;
    } else {
      const meta = await sheetsJson(accessToken, `${SHEETS_API}/${enc(spreadsheetId)}`);
      spreadsheetUrl = meta.spreadsheetUrl;
    }

    async function ensureHeaders(tab, headers) {
      const r = await fetch(`${SHEETS_API}/${enc(spreadsheetId)}/values/${enc(tab)}!A1:A1`, { headers: { Authorization: `Bearer ${accessToken}` } });
      let hasHeader = false;
      if (r.ok) { const j = await r.json(); hasHeader = !!(j.values && j.values.length); }
      if (!hasHeader) {
        await fetch(`${SHEETS_API}/${enc(spreadsheetId)}/values/${enc(tab)}!A1:Z1?valueInputOption=RAW`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ values: [headers] }),
        });
      }
    }

    async function existingIds(tab) {
      const r = await fetch(`${SHEETS_API}/${enc(spreadsheetId)}/values/${enc(tab)}!A2:A`, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!r.ok) return new Set();
      const j = await r.json();
      return new Set((j.values || []).flat().filter(Boolean));
    }

    async function appendNew(tab, headers, rows) {
      await ensureHeaders(tab, headers);
      const seen = await existingIds(tab);
      const newRows = rows.filter((row) => row[0] && !seen.has(row[0]));
      if (!newRows.length) return 0;
      await fetch(`${SHEETS_API}/${enc(spreadsheetId)}/values/${enc(tab)}!A:Z:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: newRows }),
      });
      return newRows.length;
    }

    const govRows = audits.map((a) => [a.id, a.created_date || '', a.event_type || '', a.entity_type || '', a.entity_id || '', a.actor_id || '', a.summary || '']);
    const corrRows = corrections.map((c) => [c.id, c.created_date || '', c.inquiry_id || '', c.from_version ?? '', c.to_version ?? '', c.severity || '', c.detected_by || '', c.time_to_correction ?? '', c.trust_delta ?? '', c.drift_score ?? '', c.notes || '']);

    const governance_appended = await appendNew(GOV_TAB, GOV_HEADERS, govRows);
    const correction_appended = await appendNew(CORR_TAB, CORR_HEADERS, corrRows);

    return Response.json({
      status: 'ok',
      spreadsheet_id: spreadsheetId,
      spreadsheet_url: spreadsheetUrl,
      created,
      window_days: 7,
      governance_appended,
      correction_appended,
    });
  } catch (error) {
    console.error('weeklyAuditExport error', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}