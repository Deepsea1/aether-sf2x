import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Orbit, Loader2, RefreshCw, LayoutGrid, List as ListIcon, Search, Keyboard, Globe2,
} from 'lucide-react';
import PublicNav from '@/components/sf2x/PublicNav';
import { base44 } from '@/api/base44Client';
import EpistemicBadge from '@/components/aether/EpistemicBadge';
import HonestEmpty from '@/components/aether/HonestEmpty';
import StateLegend from '@/components/aether/StateLegend';
import Surface from '@/components/aether/Surface';
import { useReducedMotion } from '@/lib/design/useReducedMotion';
import { toGraph, applyLens, lensAvailability, NODE_TYPE_LABEL } from '@/lib/cosmos/graph';
import LensRail from '@/components/cosmos/LensRail';
import CosmosCanvas from '@/components/cosmos/CosmosCanvas';
import CosmosList from '@/components/cosmos/CosmosList';
import NodeDetail from '@/components/cosmos/NodeDetail';

// THE COSMOS — the action-first epistemic map (MASTER_PLAN v5 §21.2).
//
// This is the one page where the whole record is visible at once, so it is also the one
// page most at risk of becoming a decorative hairball. Four commitments keep it honest:
//
//   1. EVERY node comes from a real registry row. The warrant log currently holds a
//      handful of warrants and one signed tree head, and public claim publication is
//      opt-in with nothing published — so this page shows a handful of warrants and says
//      so, out loud, next to the map. No filler nodes, no demo constellation.
//   2. Prominence is authority + freshness + epistemic state (see graph.js). The largest
//      thing on screen is never merely the most-connected thing.
//   3. Every lens states what it reveals, and a lens with nothing in it renders an
//      explanation instead of an empty void.
//   4. Selecting anything produces a next action. Always.
//
// The map is one of two equal views. The List view carries strictly more text and is the
// default on small screens; the canvas is the spatial reading of the same rows.

const CLAIMS_EMPTY_REASON =
  'Public claim publication is opt-in, and no customer has published one yet. The map below is built from the signed warrant log instead — the part of the record that is public by design. This is a true empty, not a loading state and not a failure.';

function useIsSmallScreen() {
  const [small, setSmall] = useState(() => (typeof window === 'undefined' ? false : window.innerWidth < 768));
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onResize = () => setSmall(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return small;
}

async function call(fn, body) {
  const res = await base44.functions.invoke(fn, body);
  return res?.data || res;
}

export default function Cosmos() {
  const reduced = useReducedMotion();
  const small = useIsSmallScreen();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [feed, setFeed] = useState(null);
  const [lens, setLens] = useState('evidence');
  // The list is the default on small screens — a force graph is a hostile way to read a
  // registry on a phone. Resolved at first render so there is no flash of the wrong view.
  const [view, setView] = useState(() => (typeof window !== 'undefined' && window.innerWidth < 768 ? 'list' : 'map'));
  const [selectedId, setSelectedId] = useState(null);
  const [announce, setAnnounce] = useState('');
  const loadedOnce = useRef(false);
  const userPickedView = useRef(false);

  // Follow the viewport across a rotate or resize, but never override a deliberate choice.
  useEffect(() => {
    if (userPickedView.current) return;
    setView(small ? 'list' : 'map');
  }, [small]);

  const load = async () => {
    setLoading(true);
    setError(null);
    const [chainRes, headRes, keysRes, driftRes, calRes, claimsRes] = await Promise.allSettled([
      call('warrantRegistry', { limit: 250 }),
      call('warrantRegistry', { op: 'checkpoint' }),
      call('warrantRegistry', { op: 'keys' }),
      call('driftAlert', { op: 'mode' }),
      call('publishCalibration', { op: 'capability_card', domain_pack_id: 'default' }),
      call('searchClaims', { limit: 24 }),
    ]);

    if (chainRes.status !== 'fulfilled' || !chainRes.value) {
      setError(chainRes.reason?.message || 'The warrant registry did not answer.');
      setFeed(null);
      setLoading(false);
      return;
    }

    const chainData = chainRes.value;
    const claimsData = claimsRes.status === 'fulfilled' ? claimsRes.value : null;
    const published = Array.isArray(claimsData?.claims)
      ? claimsData.claims
      : Array.isArray(claimsData?.results) ? claimsData.results
        : Array.isArray(claimsData) ? claimsData : [];

    setFeed({
      chain: Array.isArray(chainData.chain) ? chainData.chain : [],
      root: chainData.root || null,
      merkleRoot: chainData.merkle_root || null,
      treeSize: chainData.tree_size ?? null,
      count: chainData.count ?? null,
      head: headRes.status === 'fulfilled' ? (headRes.value?.head || null) : null,
      keys: keysRes.status === 'fulfilled' ? (keysRes.value?.keys || []) : [],
      drift: driftRes.status === 'fulfilled' && driftRes.value?.mode ? driftRes.value : null,
      capabilityCard: calRes.status === 'fulfilled' ? (calRes.value?.card || null) : null,
      enforcing: calRes.status === 'fulfilled' ? (calRes.value?.enforcing || null) : null,
      published,
      claimsReachable: claimsRes.status === 'fulfilled',
      now: Date.now(),
    });
    setLoading(false);
    loadedOnce.current = true;
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const graph = useMemo(() => {
    if (!feed) return { nodes: [], edges: [], meta: { now: Date.now() } };
    return toGraph(feed.chain, {
      now: feed.now,
      head: feed.head || (feed.merkleRoot ? { merkle_root: feed.merkleRoot, tree_size: feed.treeSize } : null),
      keys: feed.keys,
      driftMode: feed.drift,
      capabilityCard: feed.capabilityCard,
      enforcing: feed.enforcing,
      publishedClaims: feed.published,
    });
  }, [feed]);

  const availability = useMemo(() => lensAvailability(graph), [graph]);
  const lensed = useMemo(() => applyLens(graph, lens), [graph, lens]);

  const selected = useMemo(
    () => lensed.nodes.find((n) => n.id === selectedId) || graph.nodes.find((n) => n.id === selectedId) || null,
    [lensed.nodes, graph.nodes, selectedId],
  );

  // Relations come from the FULL graph, not the lensed subset: hiding a node from a view
  // must never hide the fact that it is connected to the thing you are reading about.
  const relations = useMemo(() => {
    if (!selected) return [];
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    const out = [];
    for (const e of graph.edges) {
      if (e.source === selected.id) out.push({ type: e.type, direction: 'out', otherId: e.target, other: byId.get(e.target) });
      else if (e.target === selected.id) out.push({ type: e.type, direction: 'in', otherId: e.source, other: byId.get(e.source) });
    }
    return out;
  }, [selected, graph]);

  const pick = (node) => {
    if (!node) return;
    setSelectedId(node.id);
    setAnnounce(`Selected ${NODE_TYPE_LABEL[node.type] || node.type}: ${node.label}. State: ${node.state}. ${relationsCountText(graph, node.id)}`);
  };

  const totals = useMemo(() => {
    const byState = {};
    for (const n of graph.nodes) byState[n.state] = (byState[n.state] || 0) + 1;
    return byState;
  }, [graph]);

  const presentStates = useMemo(
    () => Object.keys(totals).sort((a, b) => totals[b] - totals[a]),
    [totals],
  );

  return (
    <div className="min-h-screen bg-[#070A0F] text-slate-200">
      <PublicNav />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {/* ---------------------------------------------------------------- header */}
        <header className="mb-6">
          <div className="mb-2 inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-slate-500">
            <Orbit className="h-3.5 w-3.5" aria-hidden="true" /> Epistemic map
          </div>
          <h1 className="font-heading text-2xl font-semibold text-white">The Cosmos</h1>
          <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-slate-400">
            Every artifact in the public record, drawn as one map. Size means authority, freshness and
            epistemic state — never how many things point at a node. Pick a lens to ask a different
            question of the same evidence, then select anything to see what to do about it.
          </p>
        </header>

        {/* ------------------------------------------------------------- meta strip */}
        {feed ? (
          <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetaCard label="Warrants in the log" value={feed.chain.length} note={feed.count != null && feed.count !== feed.chain.length ? `${feed.count} total · ${feed.chain.length} loaded` : 'all loaded'} />
            <MetaCard
              label="Transparency tree"
              value={feed.head?.tree_size ?? feed.treeSize ?? '—'}
              note={feed.head?.merkle_root || feed.merkleRoot ? `root ${String(feed.head?.merkle_root || feed.merkleRoot).slice(0, 12)}…` : 'no head published'}
            />
            <MetaCard label="Nodes on the map" value={graph.nodes.length} note={`${graph.edges.length} relations`} />
            <MetaCard
              label="Operating mode"
              value={feed.drift?.mode || 'unreported'}
              note={feed.drift?.since ? `since ${String(feed.drift.since).slice(0, 10)}` : 'the drift monitor did not answer'}
            />
          </div>
        ) : null}

        {/* -------------------------------------------------------------- the state */}
        {loading && !loadedOnce.current ? (
          <Surface className="flex items-center gap-3 p-8 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Reading the signed warrant log…
          </Surface>
        ) : error ? (
          <HonestEmpty
            title="The registry did not answer"
            state="unknown"
            reason={`No map can be drawn without the log, and drawing one anyway would be a lie. ${error}`}
            action={{ label: 'Try the registry again', onClick: load, icon: RefreshCw }}
          />
        ) : (
          <>
            <LensRail value={lens} onChange={(k) => { setLens(k); setSelectedId(null); }} availability={availability} className="mb-4" />

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
              {/* ------------------------------------------------------ the view */}
              <Surface className="p-0">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="inline-flex rounded-lg border border-white/10 p-0.5" role="group" aria-label="View mode">
                      {[
                        { key: 'map', label: 'Map', Icon: LayoutGrid },
                        { key: 'list', label: 'List', Icon: ListIcon },
                      ].map((v) => (
                        <button
                          key={v.key}
                          type="button"
                          onClick={() => { userPickedView.current = true; setView(v.key); }}
                          aria-pressed={view === v.key}
                          className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7DD3FC]/70 ${
                            view === v.key ? 'bg-white/[0.09] text-white' : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          <v.Icon className="h-3.5 w-3.5" aria-hidden="true" />
                          {v.label}
                        </button>
                      ))}
                    </div>
                    <span className="text-[11px] tabular-nums text-slate-500">
                      {lensed.nodes.length} of {graph.nodes.length} shown
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-slate-600">
                    <Keyboard className="h-3.5 w-3.5" aria-hidden="true" />
                    {view === 'map' ? 'Arrows move · Enter opens' : 'Tab moves · Enter opens'}
                  </div>
                </div>

                {lensed.empty ? (
                  <div className="p-4">
                    <HonestEmpty
                      title="This lens has nothing to show today"
                      state="unknown"
                      reason={lensed.emptyReason}
                      action={{ label: 'Back to the Evidence lens', onClick: () => setLens('evidence'), icon: Search }}
                    />
                  </div>
                ) : view === 'list' ? (
                  <div className="h-[560px] p-3">
                    <CosmosList nodes={lensed.nodes} selectedId={selectedId} onSelect={pick} now={graph.meta.now} />
                  </div>
                ) : (
                  <div className="h-[560px] p-2">
                    <CosmosCanvas
                      nodes={lensed.nodes}
                      edges={lensed.edges}
                      selectedId={selectedId}
                      onSelect={pick}
                      reduced={reduced}
                      legendId="cosmos-key"
                      lensKey={lens}
                      showReach={lens === 'impact'}
                    />
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2 border-t border-white/10 px-4 py-3">
                  <span className="text-[10px] uppercase tracking-[0.16em] text-slate-600">In this view</span>
                  {presentStates.length ? (
                    presentStates.map((s) => (
                      <EpistemicBadge key={s} state={s} size="sm" label={`${totals[s]} ${s === 'qualified' ? 'with limits' : s}`} />
                    ))
                  ) : (
                    <span className="text-[11px] text-slate-500">nothing recorded</span>
                  )}
                </div>
              </Surface>

              {/* -------------------------------------------------- the side column */}
              <div className="flex flex-col gap-4">
                {selected ? (
                  <NodeDetail
                    node={selected}
                    relations={relations}
                    now={graph.meta.now}
                    onClose={() => setSelectedId(null)}
                  />
                ) : (
                  <HonestEmpty
                    title="Nothing selected yet"
                    state="unknown"
                    icon={Orbit}
                    reason={
                      lensed.nodes.length
                        ? 'Select any artifact — on the map with the arrow keys, or in the list with Tab — to see what it is, why it is drawn that size, and the one thing to do about it.'
                        : 'There is nothing in this lens to select.'
                    }
                    action={lensed.nodes.length
                      ? { label: `Open the most authoritative artifact`, onClick: () => pick(lensed.nodes[0]) }
                      : { label: 'Run a verification', to: '/playground' }}
                  />
                )}

                {/* The honest empty that matters most on this page. */}
                <Surface className="p-0">
                  <div className="border-b border-white/10 px-4 py-3">
                    <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-slate-500">
                      <Globe2 className="h-3.5 w-3.5" aria-hidden="true" /> Public claim index
                    </div>
                  </div>
                  <div className="p-3">
                    {feed?.published?.length ? (
                      <ul className="space-y-2">
                        {feed.published.slice(0, 6).map((c, i) => (
                          <li key={c.id || i} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5 text-[12px] text-slate-300">
                            {c.text || c.title || 'Published claim'}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <HonestEmpty
                        title="No claims are published"
                        state="blocked"
                        icon={Globe2}
                        align="left"
                        reason={feed?.claimsReachable
                          ? CLAIMS_EMPTY_REASON
                          : `${CLAIMS_EMPTY_REASON} (The claim index also did not answer this request, so this is reported as unavailable rather than as zero.)`}
                        action={{ label: 'See how publication works', to: '/public/claims' }}
                      />
                    )}
                  </div>
                </Surface>

                <Surface tone="inset" className="p-4">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Reading the map</div>
                  <ul className="mt-2 space-y-1.5 text-[12px] leading-relaxed text-slate-400">
                    <li><span className="text-slate-300">Size</span> — authority, freshness and epistemic state. Never popularity.</li>
                    <li><span className="text-slate-300">Shape</span> — round is a live verdict, angular is a conflict, square is a state of the record.</li>
                    <li><span className="text-slate-300">Dashes</span> — only ever a hypothesis, which can never be cited as support.</li>
                    <li><span className="text-slate-300">Rings</span> — downstream reach, in the Impact lens only. Reach is never drawn as size.</li>
                  </ul>
                </Surface>
              </div>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
              <StateLegend id="cosmos-key" />
              <Surface tone="inset" className="p-4">
                <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Verify any of this yourself</div>
                <p className="mt-2 text-[12px] leading-relaxed text-slate-400">
                  Every warrant on this map carries a signature and, where the log has committed it, an
                  inclusion proof you can recompute in your own browser. Don&apos;t take the picture&apos;s word for it.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link to="/warrant-proof" className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-white/25 hover:bg-white/[0.08]">
                    Check a warrant
                  </Link>
                  <Link to="/registry" className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-white/25 hover:bg-white/[0.08]">
                    Browse the registry
                  </Link>
                </div>
              </Surface>
            </div>
          </>
        )}

        {/* The canvas cannot be entered by a screen reader; this is how selection speaks. */}
        <p className="sr-only" role="status" aria-live="polite">{announce}</p>
      </main>
    </div>
  );
}

function relationsCountText(graph, id) {
  const n = graph.edges.reduce((acc, e) => acc + (e.source === id || e.target === id ? 1 : 0), 0);
  return n === 0 ? 'No recorded relations.' : `${n} recorded relation${n === 1 ? '' : 's'}.`;
}

function MetaCard({ label, value, note }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0B0F16] p-4">
      <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums text-slate-100">{value}</div>
      {note ? <div className="mt-0.5 text-[11px] text-slate-500">{note}</div> : null}
    </div>
  );
}
