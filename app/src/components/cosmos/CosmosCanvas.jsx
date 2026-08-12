import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { hexFor, normalizeState, stateFor, FOCUS, TEXT, SURFACE } from '@/lib/design/tokens';
import { createLayout } from '@/lib/cosmos/graph';

// The map itself. Canvas 2D, not WebGL: the live registry holds tens of nodes, the layout
// is the only real cost, and a 2D context ships zero bytes of extra bundle. three.js is
// installed and available, but reaching for it here would mean paying ~600KB to draw a
// few hundred discs — so we don't. If the log ever grows past what this comfortably
// holds, the honest upgrade is instancing in three.js behind a lazy import, not a
// hand-rolled WebGL layer here.
//
// VISUAL LAW COMPLIANCE, on a surface a screen reader cannot enter:
//   · colour is never alone — every node carries a SHAPE (circle = live verdict,
//     diamond = conflict, rounded square = a state of the record) and a GLYPH, and the
//     prominent ones carry their text label right on the canvas;
//   · the canvas is role="img" and points at <StateLegend> via aria-describedby, so the
//     colour language always has a text equivalent;
//   · every node is reachable by keyboard, and the parallel list view (default on small
//     screens) is the fully-textual twin of this picture;
//   · reduced motion settles the layout in one synchronous pass and paints the final
//     frame — the information is identical, the animation is simply not performed.

const GLYPH = {
  supported: '✓', // check
  qualified: '±', // plus-minus
  contested: '!',
  unsupported: '×', // multiplication sign
  unknown: '?',
  hypothesis: '*',
  stale: '~',
  revoked: '/',
  blocked: '−', // minus
};

// Shape is the second, colour-independent channel. Live verdicts are round, conflict is
// angular, and the record's own bookkeeping states are square — the eye sorts the three
// families before it resolves a single hue.
const SHAPE = {
  supported: 'circle', qualified: 'circle',
  contested: 'diamond', unsupported: 'diamond',
  unknown: 'square', stale: 'square', revoked: 'square', blocked: 'square',
  hypothesis: 'circle', // dashed — the only dashed thing on the canvas
};

const cssCache = new Map();
function cssFor(state) {
  const key = normalizeState(state);
  let v = cssCache.get(key);
  if (!v) { v = `#${hexFor(key).toString(16).padStart(6, '0')}`; cssCache.set(key, v); }
  return v;
}

const EDGE_TONE = {
  contradicts: { state: 'contested', dash: [4, 4], alpha: 0.55 },
  invalidates: { state: 'unsupported', dash: [4, 4], alpha: 0.55 },
  supersedes: { state: 'stale', dash: [2, 5], alpha: 0.5 },
  qualifies: { state: 'unknown', dash: [1, 4], alpha: 0.45 },
  governed_by: { state: 'blocked', dash: [], alpha: 0.35 },
};

function withAlpha(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export default function CosmosCanvas({
  nodes = [],
  edges = [],
  selectedId = null,
  onSelect,
  reduced = false,
  legendId,
  lensKey = 'evidence',
  showReach = false,
  className = '',
}) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const simRef = useRef(null);
  const frameRef = useRef(0);
  const viewRef = useRef({ scale: 1, ox: 0, oy: 0 });
  const [size, setSize] = useState({ w: 900, h: 560 });
  const [hoverId, setHoverId] = useState(null);

  // A cheap identity for "the node set changed" — re-seeds the simulation only when the
  // constellation genuinely differs, never on a re-render.
  const signature = useMemo(
    () => `${lensKey}|${nodes.length}|${nodes.map((n) => n.id).join(',')}`,
    [lensKey, nodes],
  );

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) setSize({ w: Math.max(280, Math.round(r.width)), h: Math.max(320, Math.round(r.height)) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const sim = simRef.current;
    if (!canvas || !sim) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { w, h } = size;
    const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Fit the settled cloud into the viewport with room for labels.
    const pad = 54;
    const b = sim.bounds();
    const bw = Math.max(1, b.maxX - b.minX);
    const bh = Math.max(1, b.maxY - b.minY);
    const scale = Math.min((w - pad * 2) / bw, (h - pad * 2) / bh, 1.6);
    const ox = (w - bw * scale) / 2 - b.minX * scale;
    const oy = (h - bh * scale) / 2 - b.minY * scale;
    viewRef.current = { scale, ox, oy };
    const sx = (i) => sim.x[i] * scale + ox;
    const sy = (i) => sim.y[i] * scale + oy;

    // ---- edges ----------------------------------------------------------------
    ctx.lineWidth = 1;
    for (const e of edges) {
      const i = sim.index.get(e.source);
      const j = sim.index.get(e.target);
      if (i === undefined || j === undefined) continue;
      const tone = EDGE_TONE[e.type];
      const touched = selectedId && (e.source === selectedId || e.target === selectedId);
      ctx.beginPath();
      ctx.setLineDash(tone?.dash || []);
      ctx.strokeStyle = tone
        ? withAlpha(cssFor(tone.state), touched ? Math.min(1, tone.alpha + 0.35) : tone.alpha)
        : `rgba(255,255,255,${touched ? 0.34 : 0.09})`;
      ctx.lineWidth = touched ? 1.6 : 1;
      ctx.moveTo(sx(i), sy(i));
      ctx.lineTo(sx(j), sy(j));
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // ---- nodes ----------------------------------------------------------------
    // Radius is `emphasis`, which comes from computeWeight: authority + freshness +
    // epistemic state. It is NEVER edge count — see the prominence law in graph.js.
    const labelled = [];
    for (const node of nodes) {
      const i = sim.index.get(node.id);
      if (i === undefined) continue;
      const x = sx(i);
      const y = sy(i);
      const token = stateFor(node.state);
      const colour = cssFor(node.state);
      const emphasis = node.emphasis ?? node.weight ?? 0.4;
      const r = 5.5 + emphasis * 13;
      const isSel = node.id === selectedId;
      const isHover = node.id === hoverId;
      const shape = SHAPE[token.key] || 'circle';

      // Authority halo — wide, low alpha, brightest for the most authoritative and
      // freshest artifacts. Same law, expressed as light.
      if (emphasis > 0.55 || isSel) {
        const g = ctx.createRadialGradient(x, y, r * 0.4, x, y, r * 3.4);
        g.addColorStop(0, withAlpha(colour, 0.16 * emphasis));
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r * 3.4, 0, Math.PI * 2);
        ctx.fill();
      }

      // Impact lens: downstream reach is drawn as a RING, deliberately never as size —
      // blast radius must not be mistakable for authority.
      if (showReach && node.reach > 0) {
        ctx.beginPath();
        ctx.setLineDash([2, 3]);
        ctx.strokeStyle = withAlpha(colour, 0.4);
        ctx.lineWidth = 1;
        ctx.arc(x, y, r + 5 + Math.min(10, node.reach * 2), 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.beginPath();
      if (shape === 'diamond') {
        ctx.moveTo(x, y - r * 1.16); ctx.lineTo(x + r * 1.16, y);
        ctx.lineTo(x, y + r * 1.16); ctx.lineTo(x - r * 1.16, y);
        ctx.closePath();
      } else if (shape === 'square') {
        const s = r * 0.92;
        const rad = Math.min(4, s * 0.4);
        ctx.moveTo(x - s + rad, y - s);
        ctx.arcTo(x + s, y - s, x + s, y + s, rad);
        ctx.arcTo(x + s, y + s, x - s, y + s, rad);
        ctx.arcTo(x - s, y + s, x - s, y - s, rad);
        ctx.arcTo(x - s, y - s, x + s, y - s, rad);
        ctx.closePath();
      } else {
        ctx.arc(x, y, r, 0, Math.PI * 2);
      }
      ctx.fillStyle = withAlpha(colour, token.dashed ? 0.10 : 0.22);
      ctx.fill();
      ctx.setLineDash(token.dashed ? [3, 3] : []); // dashed belongs to `hypothesis` alone
      ctx.strokeStyle = withAlpha(colour, isSel || isHover ? 1 : 0.8);
      ctx.lineWidth = isSel ? 2.4 : 1.4;
      ctx.stroke();
      ctx.setLineDash([]);

      // Glyph — the colour-independent mark. Kept inside the disc so it reads at any zoom.
      if (r >= 8) {
        ctx.fillStyle = colour;
        ctx.font = `600 ${Math.round(Math.min(13, r * 1.05))}px ui-monospace, SFMono-Regular, Menlo, monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(GLYPH[token.key] || '?', x, y + 0.5);
      }

      if (isSel) {
        ctx.beginPath();
        ctx.strokeStyle = FOCUS; // focus colour, never a verdict colour
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.arc(x, y, r + 7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      if (isSel || isHover || emphasis > 0.62) labelled.push({ node, x, y, r, isSel: isSel || isHover });
    }

    // ---- labels (drawn last so nothing overdraws them) -------------------------
    labelled.sort((a, b) => (b.node.emphasis ?? 0) - (a.node.emphasis ?? 0));
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (const l of labelled.slice(0, 22)) {
      const text = l.node.label.length > 34 ? `${l.node.label.slice(0, 33)}…` : l.node.label;
      ctx.font = `${l.isSel ? '600 ' : ''}11px ui-sans-serif, system-ui, -apple-system, sans-serif`;
      const tw = ctx.measureText(text).width;
      const tx = l.x + l.r + 8;
      const ty = l.y;
      ctx.fillStyle = `${SURFACE.void}D9`;
      ctx.fillRect(tx - 3, ty - 8, tw + 6, 16);
      ctx.fillStyle = l.isSel ? TEXT.primary : TEXT.secondary;
      ctx.fillText(text, tx, ty);
    }
  }, [nodes, edges, selectedId, hoverId, size, showReach]);

  // Build (or rebuild) the simulation, then settle it. Reduced motion settles in one
  // synchronous pass: same final frame, no animation.
  useEffect(() => {
    if (!nodes.length) { simRef.current = null; return undefined; }
    simRef.current = createLayout({ nodes, edges }, { width: size.w, height: size.h, seed: 20260811 });
    if (reduced) {
      simRef.current.run(260);
      draw();
      return undefined;
    }
    simRef.current.run(40); // start from a partly-settled state, never from a hairball
    let running = true;
    const loop = () => {
      if (!running || !simRef.current) return;
      const alpha = simRef.current.tick(1);
      draw();
      if (alpha > 0.02) frameRef.current = requestAnimationFrame(loop);
    };
    frameRef.current = requestAnimationFrame(loop);
    return () => { running = false; cancelAnimationFrame(frameRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, size.w, size.h, reduced]);

  // Repaint on selection/hover without disturbing the physics.
  useEffect(() => { draw(); }, [draw]);

  const pick = useCallback((clientX, clientY) => {
    const canvas = canvasRef.current;
    const sim = simRef.current;
    if (!canvas || !sim) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    const { scale, ox, oy } = viewRef.current;
    let best = null;
    let bestD = Infinity;
    for (const node of nodes) {
      const i = sim.index.get(node.id);
      if (i === undefined) continue;
      const x = sim.x[i] * scale + ox;
      const y = sim.y[i] * scale + oy;
      const r = 5.5 + (node.emphasis ?? node.weight ?? 0.4) * 13;
      const d = Math.hypot(mx - x, my - y);
      if (d < Math.max(r + 6, 14) && d < bestD) { bestD = d; best = node; }
    }
    return best;
  }, [nodes]);

  // Arrow keys move to the nearest node in that direction (spatial, not list order) —
  // the traversal a sighted keyboard user expects on a map. The list view provides the
  // per-node Tab stops.
  const onKeyDown = (e) => {
    if (!nodes.length) return;
    const sim = simRef.current;
    const idx = nodes.findIndex((n) => n.id === selectedId);
    const step = (delta) => {
      const next = nodes[(Math.max(0, idx) + delta + nodes.length) % nodes.length];
      if (next) onSelect?.(next);
    };
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect?.(nodes[idx >= 0 ? idx : 0]);
      return;
    }
    if (e.key === 'Home') { e.preventDefault(); onSelect?.(nodes[0]); return; }
    if (e.key === 'End') { e.preventDefault(); onSelect?.(nodes[nodes.length - 1]); return; }
    if (!e.key.startsWith('Arrow')) return;
    e.preventDefault();
    if (idx < 0 || !sim) { onSelect?.(nodes[0]); return; }
    const i0 = sim.index.get(nodes[idx].id);
    if (i0 === undefined) { step(1); return; }
    const x0 = sim.x[i0];
    const y0 = sim.y[i0];
    const want = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    let best = null;
    let bestScore = Infinity;
    for (const node of nodes) {
      if (node.id === nodes[idx].id) continue;
      const i = sim.index.get(node.id);
      if (i === undefined) continue;
      const dx = sim.x[i] - x0;
      const dy = sim.y[i] - y0;
      const along = dx * want[0] + dy * want[1];
      if (along <= 1) continue; // strictly in the requested direction
      const across = Math.abs(dx * want[1] - dy * want[0]);
      const score = along + across * 2.2; // prefer straight ahead over far off-axis
      if (score < bestScore) { bestScore = score; best = node; }
    }
    if (best) onSelect?.(best);
    else step(e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1); // wrap rather than dead-end
  };

  return (
    <div ref={wrapRef} className={`relative h-full w-full ${className}`}>
      <canvas
        ref={canvasRef}
        role="img"
        tabIndex={0}
        aria-label={`Epistemic map, ${lensKey} lens: ${nodes.length} artifacts. Use the arrow keys to move between them and Enter to open one. A full text list of the same data is available in the List view.`}
        aria-describedby={legendId}
        style={{ width: '100%', height: '100%', display: 'block', touchAction: 'manipulation' }}
        className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-[#7DD3FC]/70"
        onKeyDown={onKeyDown}
        onClick={(e) => { const n = pick(e.clientX, e.clientY); if (n) onSelect?.(n); }}
        onMouseMove={(e) => {
          const n = pick(e.clientX, e.clientY);
          const id = n ? n.id : null;
          if (id !== hoverId) setHoverId(id);
          if (canvasRef.current) canvasRef.current.style.cursor = n ? 'pointer' : 'default';
        }}
        onMouseLeave={() => setHoverId(null)}
      />
      <p className="pointer-events-none absolute bottom-2 left-3 text-[10px] uppercase tracking-[0.16em] text-slate-600">
        Size = authority + freshness + state · never popularity
      </p>
    </div>
  );
}
