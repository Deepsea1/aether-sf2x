import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { requireAdmin } from '../../shared/auth.js';

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const GOV_HEADERS = ['Timestamp', 'Decision', 'Event Type', 'Entity Type', 'Entity ID', 'Actor', 'Summary'];
const CORR_HEADERS = ['Timestamp', 'Inquiry ID', 'From Version', 'To Version', 'Severity', 'Detected By', 'MTTC (s)', 'Trust Delta', 'Drift Score', 'Notes'];
const AD_HEADERS = ['Date', 'Decision', 'Entity Type', 'Entity ID', 'Summary', 'Actor'];

function decisionFor(a) {
  const s = (a.summary || '').toLowerCase();
  if (a.event_type === 'gate_decision') {
    if (s.includes('approved')) return 'Approved';
    if (s.includes('suspend')) return 'Denied (suspended)';
    if (s.includes('degrad')) return 'Denied (degraded)';
    return 'Gate decision';
  }
  if (a.event_type === 'review_decision') {
    if (s.includes('approved')) return 'Approved';
    if (s.includes('rejected')) return 'Denied (rejected)';
    if (s.includes('killed')) return 'Denied (killed)';
    if (s.includes('flagged')) return 'Flagged';
    return 'Reviewed';
  }
  if (a.event_type === 'kill_switch') return 'Denied (kill switch)';
  if (a.event_type === 'answer_promoted') return 'Approved (promoted)';
  if (a.event_type === 'correction_logged') return 'Corrected';
  return a.event_type || '';
}
function isOutcome(d) { return !!d && (d.startsWith('Approved') || d.startsWith('Denied') || d === 'Corrected' || d === 'Flagged'); }

function enc(s) { return encodeURIComponent(String(s)); }

async function sheetsFetch(token, path, opts = {}) {
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
    let body = {};
    try { body = await req.json(); } catch { body = {}; }

    const _auth = await requireAdmin(base44);
    if (!_auth.ok) return _auth.response;

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlesheets');

    const [audits, corrections] = await Promise.all([
      base44.asServiceRole.entities.AuditLog.list('-created_date', 1000),
      base44.asServiceRole.entities.CorrectionEvent.list('-created_date', 1000),
    ]);

    const govRows = audits.map((a) => [
      a.created_date || '', decisionFor(a), a.event_type || '', a.entity_type || '', a.entity_id || '', a.actor_id || '', a.summary || '',
    ]);
    const corrRows = corrections.map((c) => [
      c.created_date || '', c.inquiry_id || '', c.from_version ?? '', c.to_version ?? '', c.severity || '', c.detected_by || '',
      c.time_to_correction ?? '', c.trust_delta ?? '', c.drift_score ?? '', c.notes || '',
    ]);
    const adRows = audits
      .map((a) => ({ d: decisionFor(a), a }))
      .filter((x) => isOutcome(x.d))
      .map((x) => [x.a.created_date || '', x.d, x.a.entity_type || '', x.a.entity_id || '', x.a.summary || '', x.a.actor_id || '']);

    const SHEET_TITLE = 'SF2X Audit & Correction Export';
    let spreadsheetId = body.spreadsheet_id;
    let spreadsheetUrl = null;
    let created = false;

    if (!spreadsheetId) {
      // Reuse the existing export sheet created by this app, if any (no secret needed).
      const driveRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${enc("name='" + SHEET_TITLE + "'")}&fields=files(id)&pageSize=1`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (driveRes.ok) {
        const driveJson = await driveRes.json();
        spreadsheetId = driveJson.files?.[0]?.id || null;
      }
    }

    if (!spreadsheetId) {
      const doc = await sheetsFetch(accessToken, SHEETS_API, {
        method: 'POST',
        body: JSON.stringify({
          properties: { title: SHEET_TITLE },
          sheets: [
            { properties: { title: 'Governance Decisions' } },
            { properties: { title: 'Correction Events' } },
            { properties: { title: 'Approvals & Denials' } },
          ],
        }),
      });
      spreadsheetId = doc.spreadsheetId;
      spreadsheetUrl = doc.spreadsheetUrl;
      created = true;
    } else {
      const meta = await sheetsFetch(accessToken, `${SHEETS_API}/${enc(spreadsheetId)}`);
      spreadsheetUrl = meta.spreadsheetUrl;
    }

    async function ensureSheet(title) {
      const meta = await sheetsFetch(accessToken, `${SHEETS_API}/${enc(spreadsheetId)}`);
      if (!meta.sheets?.some((s) => s.properties?.title === title)) {
        await sheetsFetch(accessToken, `${SHEETS_API}/${enc(spreadsheetId)}:batchUpdate`, {
          method: 'POST',
          body: JSON.stringify({ requests: [{ addSheet: { properties: { title } } }] }),
        });
      }
    }

    async function writeSheet(title, headers, rows) {
      await sheetsFetch(accessToken, `${SHEETS_API}/${enc(spreadsheetId)}/values/${enc(title)}!A1:Z:clear`, { method: 'POST' });
      const values = [headers, ...rows];
      const r = await fetch(`${SHEETS_API}/${enc(spreadsheetId)}/values/${enc(title)}!A1?valueInputOption=RAW`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ values }),
      });
      if (!r.ok) throw new Error('write ' + title + ' ' + r.status + ': ' + (await r.text()).slice(0, 200));
    }

    await ensureSheet('Approvals & Denials');
    await writeSheet('Governance Decisions', GOV_HEADERS, govRows);
    await writeSheet('Correction Events', CORR_HEADERS, corrRows);
    await writeSheet('Approvals & Denials', AD_HEADERS, adRows);

    return Response.json({
      status: 'ok',
      spreadsheet_id: spreadsheetId,
      spreadsheet_url: spreadsheetUrl,
      created,
      governance_rows: govRows.length,
      correction_rows: corrRows.length,
      approvals_denials_rows: adRows.length,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}