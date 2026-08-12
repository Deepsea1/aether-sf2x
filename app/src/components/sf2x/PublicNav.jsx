import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  ShieldCheck, ChevronDown, Menu, X, Sparkles, Trophy, BarChart3, Code2, BookOpen, FileText,
  Shield, GitBranch as GitBranchIcon, Users, Scale, Mail, CreditCard, FileCheck, KeyRound,
  Swords, Award, Github, Puzzle, ExternalLink, Plug, Orbit, Fingerprint, Radio,
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import SkipLink, { RouteAnnouncer } from '@/components/aether/SkipLink';
import { prefetchProps } from '@/lib/design/prefetch';

// One shared public navigation bar with a dropdown menu — used on every public page
// so navigation is consistent across the whole site (desktop + mobile).
//
// ACCESSIBILITY CONTRACT (see AppShell for the same contract on the signed-in side):
//  · <SkipLink> is the first focusable node on every public page, because this header is the
//    first thing every public page renders.
//  · The menu is a disclosure, not a modal: aria-expanded + aria-controls on the trigger,
//    Escape closes it AND returns focus to the trigger (otherwise focus lands on <body> and
//    the next Tab restarts the page — the single most common SPA menu bug), and focus moving
//    out of the header closes it so it can never be left open behind an invisible cursor.
//  · Active links carry aria-current="page" and a left rule, so "where am I" survives without
//    colour.
//
// CONTRAST against this header's ground #070A0F, WCAG 2.1:
//    #94A3B8 7.73:1 ✓ · #78879E 5.44:1 ✓ · #64748B (slate-500) 4.17:1 ✗ · #475569 2.62:1 ✗
// slate-500 previously carried the tagline, every group heading and the footer link. Replaced.

const FOCUS_RING = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7DD3FC]/80 focus-visible:ring-offset-1 focus-visible:ring-offset-[#070A0F]';

const MENU_ID = 'public-nav-menu';

const GROUPS = [
  {
    label: 'Showcase',
    items: [
      { to: '/cosmos', label: 'Cosmos', Icon: Orbit },
      { to: '/proof', label: 'Proof Theater', Icon: Fingerprint },
      { to: '/live', label: 'Live Tribunal', Icon: Radio },
    ],
  },
  {
    label: 'Verify',
    items: [
      { to: '/playground', label: 'Playground', Icon: Sparkles },
      { to: '/compare', label: 'Compare', Icon: BarChart3 },
      { to: '/multi-model', label: 'Multi-Model', Icon: Users },
      { to: '/arena', label: 'Red-Team Arena', Icon: Swords },
      { to: '/hall-of-fame', label: 'Hall of Fame', Icon: Award },
      { to: '/warrant-proof', label: 'Warrant Proof', Icon: KeyRound },
      { to: '/public/claims', label: 'Public Claims', Icon: FileText },
    ],
  },
  {
    label: 'Rankings',
    items: [
      { to: '/leaderboard', label: 'Leaderboard', Icon: Trophy },
      { to: '/benchmark', label: 'Benchmark', Icon: BarChart3 },
      { to: '/registry', label: 'Registry', Icon: BookOpen },
      { to: '/methodology', label: 'Methodology', Icon: FileText },
    ],
  },
  {
    label: 'Developers',
    items: [
      { to: '/api-docs', label: 'API Docs', Icon: Code2 },
      { to: '/mcp', label: 'MCP Server', Icon: Plug },
      { to: '/warrant-spec', label: 'Warrant Spec', Icon: FileCheck },
      { to: '/warrant-verifier', label: 'Verifier Spec', Icon: Scale },
      { to: '/github-action', label: 'GitHub Action', Icon: Github },
      { to: '/github-pr-verify', label: 'PR Verify', Icon: GitBranchIcon },
      { to: '/extension', label: 'Extension', Icon: Puzzle },
      { to: '/embed', label: 'Embed', Icon: Code2 },
    ],
  },
  {
    label: 'Company',
    items: [
      { to: '/about', label: 'About', Icon: Users },
      { to: '/contact', label: 'Contact', Icon: Mail },
      { to: '/pricing', label: 'Pricing', Icon: CreditCard },
      { to: '/terms', label: 'Terms', Icon: FileText },
      { to: '/privacy', label: 'Privacy', Icon: Shield },
    ],
  },
];

// The showcase surfaces lead, because they are the argument. The three that used to be here
// keep their place but step back to large screens so the bar never crowds at md.
const INLINE = [
  { to: '/cosmos', label: 'Cosmos' },
  { to: '/proof', label: 'Proof' },
  { to: '/live', label: 'Live' },
  { to: '/playground', label: 'Playground', wide: true },
  { to: '/leaderboard', label: 'Leaderboard', wide: true },
  { to: '/benchmark', label: 'Benchmark', wide: true },
  { to: '/pricing', label: 'Pricing' },
];

export default function PublicNav() {
  const [open, setOpen] = useState(false);
  const [authed, setAuthed] = useState(false);
  const { pathname } = useLocation();
  const ref = useRef(null);
  const dropRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => { base44.auth.isAuthenticated().then(setAuthed).catch(() => setAuthed(false)); }, []);
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target) && dropRef.current && !dropRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      // Give focus back to the control that opened the menu. Without this, focus falls to
      // <body> and the next Tab starts the page over — which reads as a broken page.
      triggerRef.current?.focus();
    };
    // Tabbing out of the last menu item should close the menu, not leave it hanging open
    // behind the rest of the page.
    const onFocusOut = (e) => {
      const next = e.relatedTarget;
      if (!next) return;
      if (ref.current?.contains(next) || dropRef.current?.contains(next)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('focusout', onFocusOut);
    };
  }, [open]);

  return (
    <header className="border-b border-white/5 bg-[#070A0F]/90 backdrop-blur sticky top-0 z-40">
      <SkipLink />
      <RouteAnnouncer />

      <div className="mx-auto max-w-6xl px-4 sm:px-6 h-14 flex items-center justify-between">
        <Link to="/" {...prefetchProps('/')} className={`flex items-center gap-2.5 shrink-0 rounded-lg ${FOCUS_RING}`}>
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center">
            <ShieldCheck className="h-4 w-4 text-[#070A0F]" strokeWidth={2.5} aria-hidden="true" />
          </div>
          <span className="font-heading font-semibold text-white">Aether</span>
          {/* was text-slate-500 at 10px — 4.17:1, an AA fail. #78879E measures 5.44:1. */}
          <span className="text-[10px] uppercase tracking-[0.16em] text-[#78879E] hidden lg:inline">The Truth Layer for AI</span>
        </Link>

        <div className="flex items-center gap-3" ref={ref}>
          <nav className="hidden md:flex items-center gap-4 text-xs" aria-label="Quick links">
            {INLINE.map((l) => {
              const active = pathname === l.to;
              return (
                <Link
                  key={l.to}
                  to={l.to}
                  {...prefetchProps(l.to)}
                  aria-current={active ? 'page' : undefined}
                  className={`rounded ${l.wide ? 'hidden lg:inline' : ''} ${FOCUS_RING} ${
                    active
                      ? 'text-white underline decoration-[#7DD3FC] decoration-2 underline-offset-[6px]'
                      : 'text-[#94A3B8] hover:text-white'
                  }`}
                >
                  {l.label}
                </Link>
              );
            })}
          </nav>

          {authed && (
            <Link to="/console" {...prefetchProps('/console')} className={`hidden sm:inline-flex rounded text-xs text-emerald-300 hover:text-emerald-200 ${FOCUS_RING}`}>Console</Link>
          )}
          {!authed && (
            <Link to="/login" {...prefetchProps('/login')} className={`hidden sm:inline-flex rounded text-xs text-emerald-300 hover:text-emerald-200 ${FOCUS_RING}`}>Sign in</Link>
          )}

          <button
            type="button"
            ref={triggerRef}
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? 'Close the site menu' : 'Open the site menu'}
            aria-expanded={open}
            aria-controls={MENU_ID}
            className={`h-9 px-2.5 inline-flex items-center gap-1.5 rounded-lg border border-white/10 text-slate-200 hover:bg-white/5 text-xs font-medium ${FOCUS_RING}`}
          >
            {open ? <X className="h-4 w-4" aria-hidden="true" /> : <Menu className="h-4 w-4" aria-hidden="true" />}
            <span className="hidden sm:inline">Menu</span>
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
        </div>
      </div>

      {open && (
        <div ref={dropRef} id={MENU_ID} className="absolute left-0 right-0 top-14 bg-[#0B0F16] border-b border-white/10 shadow-2xl">
          <nav aria-label="All pages" className="mx-auto max-w-6xl px-4 sm:px-6 py-5 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-5">
            {GROUPS.map((g) => (
              <div key={g.label}>
                {/* was text-slate-500 — now #78879E (5.44:1), and a real heading so a screen
                    reader can jump between menu sections instead of hearing one link soup. */}
                <h2 className="text-[10px] uppercase tracking-[0.16em] text-[#78879E] mb-2 px-2">{g.label}</h2>
                <div className="space-y-0.5">
                  {g.items.map((item) => {
                    const active = pathname === item.to;
                    return (
                      <Link
                        key={item.to}
                        to={item.to}
                        {...prefetchProps(item.to)}
                        aria-current={active ? 'page' : undefined}
                        className={`flex items-center gap-2.5 border-l-2 pl-1.5 pr-2 py-2 rounded-lg text-[13px] transition-colors ${FOCUS_RING} ${
                          active
                            ? 'border-[#7DD3FC] bg-white/[0.06] text-white ring-1 ring-white/10'
                            : 'border-transparent text-slate-300 hover:text-white hover:bg-white/[0.04]'
                        }`}
                      >
                        <item.Icon className={`h-3.5 w-3.5 shrink-0 ${active ? 'text-[#7DD3FC]' : 'text-[#78879E]'}`} aria-hidden="true" />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
          <div className="mx-auto max-w-6xl px-4 sm:px-6 pb-4 flex items-center justify-between">
            <Link to="/verify/demo" className={`rounded text-[11px] text-[#94A3B8] hover:text-white inline-flex items-center gap-1 ${FOCUS_RING}`}>
              <ExternalLink className="h-3 w-3" aria-hidden="true" /> Verify a proof
            </Link>
            {authed ? (
              <Link to="/console" {...prefetchProps('/console')} className={`rounded text-xs text-emerald-300 hover:text-emerald-200 ${FOCUS_RING}`}>Open Console →</Link>
            ) : (
              <Link to="/register" {...prefetchProps('/register')} className={`rounded text-xs text-emerald-300 hover:text-emerald-200 ${FOCUS_RING}`}>Get started free →</Link>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
