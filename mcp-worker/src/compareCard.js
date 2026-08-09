/**
 * Diagnostic card renderer — the shareable artifact for the multi-model matrix.
 *
 * Emits a self-contained SVG. SVG rather than PNG on purpose: it renders inside a
 * Cloudflare Worker with zero dependencies and no headless browser, it stays crisp at
 * any resolution for social posts, and it can be converted to PNG downstream by
 * whatever already has a rasterizer. `satori`/`puppeteer-core` would both mean new
 * dependencies and, in the Worker case, a runtime that cannot host them.
 *
 * HONESTY IN THE PICTURE. The legend always names all three states including grey
 * "not assessed", and the footer states the grey caveat outright. A card that showed
 * only green and red would imply the tribunal examined every sentence, which is the
 * one thing this artifact must never imply. Models that produced no score are drawn
 * in their own row style with the reason, not omitted — omitting them would quietly
 * flatter the comparison.
 */

import { STATE_COLORS } from './compare.js';

const CARD_BG = '#0d1117';
const PANEL_BG = '#161b22';
const TEXT = '#e6edf3';
const MUTED = '#8a8f98';
const ACCENT = '#58a6ff';

/** XML-escape every interpolated string — a prompt can contain &, <, quotes. */
function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function clip(text, max) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/**
 * renderDiagnosticCard — the matrix as an SVG string.
 *
 * Width is fixed; height grows with the number of models so nothing is clipped.
 */
export function renderDiagnosticCard(matrix, { width = 1200, title = 'Aether Multi-Model Diagnostic' } = {}) {
  const rows = Array.isArray(matrix?.rows) ? matrix.rows : [];
  const rowH = 74;
  const headerH = 172;
  const footerH = 96;
  const height = headerH + rows.length * rowH + footerH;

  const pad = 48;
  const barX = 420;
  const barW = width - barX - pad - 120;

  const parts = [];

  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="ui-sans-serif, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif">`,
  );
  parts.push(`<rect width="${width}" height="${height}" fill="${CARD_BG}"/>`);

  // Header
  parts.push(
    `<text x="${pad}" y="58" fill="${TEXT}" font-size="30" font-weight="700">🛡 ${esc(title)}</text>`,
  );
  parts.push(
    `<text x="${pad}" y="90" fill="${MUTED}" font-size="16">Same question, every model — verified by the Aether tribunal</text>`,
  );
  parts.push(
    `<text x="${pad}" y="124" fill="${ACCENT}" font-size="17" font-style="italic">“${esc(clip(matrix?.prompt, 108))}”</text>`,
  );

  // Legend — always all three states, grey included.
  const legend = [
    ['Verified', STATE_COLORS.verified],
    ['Unsupported', STATE_COLORS.unsupported],
    ['Not assessed', STATE_COLORS.unassessed],
  ];
  let lx = pad;
  for (const [label, color] of legend) {
    parts.push(`<rect x="${lx}" y="142" width="13" height="13" rx="3" fill="${color}"/>`);
    parts.push(`<text x="${lx + 20}" y="153" fill="${MUTED}" font-size="14">${esc(label)}</text>`);
    lx += 26 + label.length * 8.2;
  }

  // Rows
  rows.forEach((row, i) => {
    const y = headerH + i * rowH;
    const counts = row.counts || { verified: 0, unsupported: 0, unassessed: 0 };
    const total = counts.verified + counts.unsupported + counts.unassessed;

    parts.push(
      `<rect x="${pad}" y="${y}" width="${width - pad * 2}" height="${rowH - 12}" rx="10" fill="${PANEL_BG}"/>`,
    );
    parts.push(
      `<text x="${pad + 20}" y="${y + 28}" fill="${TEXT}" font-size="18" font-weight="600">${esc(clip(row.model, 30))}</text>`,
    );

    if (row.status === 'errored') {
      parts.push(
        `<text x="${pad + 20}" y="${y + 50}" fill="${STATE_COLORS.unsupported}" font-size="14">unavailable — ${esc(clip(row.error, 64))}</text>`,
      );
      return;
    }

    const verdict = row.verdict ? row.verdict.toUpperCase() : 'NO VERDICT';
    parts.push(`<text x="${pad + 20}" y="${y + 50}" fill="${MUTED}" font-size="13">${esc(verdict)} · ${total} sentence${total === 1 ? '' : 's'}</text>`);

    // Stacked sentence bar. An unscored/empty answer gets an explicit empty track
    // rather than a zero-width bar that would read as a clean sheet.
    if (total === 0) {
      parts.push(`<rect x="${barX}" y="${y + 20}" width="${barW}" height="22" rx="6" fill="#21262d"/>`);
      parts.push(`<text x="${barX + 12}" y="${y + 36}" fill="${MUTED}" font-size="13">no sentences to map</text>`);
    } else {
      let bx = barX;
      for (const state of ['verified', 'unsupported', 'unassessed']) {
        const w = (counts[state] / total) * barW;
        if (w <= 0) continue;
        parts.push(
          `<rect x="${bx.toFixed(1)}" y="${y + 20}" width="${w.toFixed(1)}" height="22" fill="${STATE_COLORS[state]}"/>`,
        );
        bx += w;
      }
      parts.push(
        `<text x="${barX}" y="${y + 58}" fill="${MUTED}" font-size="12">${counts.verified} verified · ${counts.unsupported} unsupported · ${counts.unassessed} not assessed</text>`,
      );
    }

    // Reliability — the tribunal's own number, or an honest dash.
    const scoreX = width - pad - 96;
    if (row.reliability === null) {
      parts.push(`<text x="${scoreX}" y="${y + 36}" fill="${MUTED}" font-size="22" font-weight="700">—</text>`);
      parts.push(`<text x="${scoreX}" y="${y + 54}" fill="${MUTED}" font-size="11">no score</text>`);
    } else {
      const color =
        row.reliability >= 70 ? STATE_COLORS.verified : row.reliability >= 50 ? '#f4a72c' : STATE_COLORS.unsupported;
      parts.push(
        `<text x="${scoreX}" y="${y + 38}" fill="${color}" font-size="26" font-weight="700">${row.reliability}</text>`,
      );
      parts.push(`<text x="${scoreX + 46}" y="${y + 38}" fill="${MUTED}" font-size="14">/100</text>`);
    }
  });

  // Footer — the caveat is part of the artifact, not a nicety.
  const fy = headerH + rows.length * rowH + 22;
  parts.push(
    `<text x="${pad}" y="${fy}" fill="${MUTED}" font-size="13">Grey = the tribunal did not assess that sentence. It is not a pass.</text>`,
  );
  const verdictLine = matrix?.winner
    ? `Highest reliability: ${matrix.winner}`
    : Array.isArray(matrix?.tied) && matrix.tied.length > 1
      ? `Tied: ${matrix.tied.join(', ')}`
      : 'No scored comparison available';
  parts.push(
    `<text x="${pad}" y="${fy + 24}" fill="${TEXT}" font-size="14" font-weight="600">${esc(verdictLine)}</text>`,
  );
  parts.push(
    `<text x="${width - pad}" y="${fy + 24}" fill="${ACCENT}" font-size="14" text-anchor="end">aether.sf2x.com · Don't trust. Verify.</text>`,
  );

  parts.push('</svg>');
  return parts.join('\n');
}

/**
 * renderOverlayHtml — the sentence-level truth overlay for one model's answer, as an
 * HTML fragment. Each sentence carries its state as a `data-state` attribute and a
 * tooltip with the tribunal's reason, so the overlay is inspectable rather than just
 * decorative.
 */
export function renderOverlayHtml(row) {
  const sentences = Array.isArray(row?.sentences) ? row.sentences : [];
  if (sentences.length === 0) return '<p class="aether-overlay-empty">No sentences to display.</p>';

  const spans = sentences.map((s) => {
    const tip = s.notes
      ? `${s.state} — ${s.notes}`
      : s.state === 'unassessed'
        ? 'not assessed by the tribunal'
        : s.state;
    return (
      `<span class="aether-s" data-state="${esc(s.state)}" data-match="${esc(s.matchMethod)}" ` +
      `style="border-bottom:3px solid ${STATE_COLORS[s.state]}" title="${esc(tip)}">${esc(s.sentence)}</span>`
    );
  });

  return `<div class="aether-overlay" data-model="${esc(row.model)}">${spans.join(' ')}</div>`;
}
