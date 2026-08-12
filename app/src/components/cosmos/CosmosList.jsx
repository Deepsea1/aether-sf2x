import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import EpistemicBadge from '@/components/aether/EpistemicBadge';
import { NODE_TYPE_LABEL, ageDays } from '@/lib/cosmos/graph';

// The textual twin of the canvas — and the DEFAULT on small screens, where a force graph
// is a hostile way to read a registry on a phone.
//
// It is not a fallback. It carries strictly more text than the map does: every node's
// state label, its type, its age in days, and its prominence as a number. Anyone using a
// screen reader, a keyboard, or a 5-inch screen gets the whole record here, with a real
// Tab stop per row.
//
// Virtualized by hand — a fixed row height and a scroll window. No dependency, no
// measurement pass, and it stays smooth if the log grows from tens of rows to thousands.

const ROW = 74;
const OVERSCAN = 6;

export default function CosmosList({
  nodes = [],
  selectedId = null,
  onSelect,
  now = Date.now(),
  className,
}) {
  const scrollerRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(520);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect?.height;
      if (h) setViewport(Math.max(200, Math.round(h)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Keep the selected row on screen when selection moves from the map or the keyboard.
  useEffect(() => {
    if (!selectedId || !scrollerRef.current) return;
    const i = nodes.findIndex((n) => n.id === selectedId);
    if (i < 0) return;
    const top = i * ROW;
    const el = scrollerRef.current;
    if (top < el.scrollTop || top + ROW > el.scrollTop + el.clientHeight) {
      el.scrollTo({ top: Math.max(0, top - el.clientHeight / 2 + ROW / 2), behavior: 'auto' });
    }
  }, [selectedId, nodes]);

  const onScroll = useCallback((e) => setScrollTop(e.currentTarget.scrollTop), []);

  const first = Math.max(0, Math.floor(scrollTop / ROW) - OVERSCAN);
  const last = Math.min(nodes.length, Math.ceil((scrollTop + viewport) / ROW) + OVERSCAN);
  const slice = nodes.slice(first, last);

  return (
    <div
      ref={scrollerRef}
      onScroll={onScroll}
      className={cn('h-full overflow-y-auto rounded-xl', className)}
      role="listbox"
      aria-label={`${nodes.length} artifacts in this lens, ordered by authority, freshness and epistemic state`}
      tabIndex={-1}
    >
      <div style={{ height: nodes.length * ROW, position: 'relative' }}>
        {slice.map((node, k) => {
          const i = first + k;
          const selected = node.id === selectedId;
          const days = ageDays(node.meta?.createdAt, now);
          const pct = Math.round((node.emphasis ?? node.weight ?? 0) * 100);
          return (
            <button
              key={node.id}
              type="button"
              role="option"
              aria-selected={selected}
              onClick={() => onSelect?.(node)}
              style={{ position: 'absolute', top: i * ROW, left: 0, right: 0, height: ROW - 6 }}
              className={cn(
                'flex w-full items-center gap-3 rounded-xl border px-3 text-left transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7DD3FC]/70',
                selected
                  ? 'border-white/25 bg-white/[0.07]'
                  : 'border-white/[0.06] bg-white/[0.015] hover:border-white/15 hover:bg-white/[0.04]',
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-[0.14em] text-slate-500">
                    {NODE_TYPE_LABEL[node.type] || node.type}
                  </span>
                  <EpistemicBadge state={node.state} size="sm" />
                </div>
                <div className="mt-1 truncate text-[13px] text-slate-200">{node.label}</div>
                <div className="mt-0.5 flex items-center gap-2 text-[10px] text-slate-500">
                  <span className="tabular-nums">
                    {days == null ? 'age not recorded' : days === 0 ? 'today' : `${days}d old`}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums" title="Prominence: authority + freshness + epistemic state. Never edge count.">
                    prominence {pct}%
                  </span>
                  {node.reach > 0 ? (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">{node.reach} downstream</span>
                    </>
                  ) : null}
                </div>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-600" aria-hidden="true" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
