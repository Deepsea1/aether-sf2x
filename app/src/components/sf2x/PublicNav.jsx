import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ShieldCheck, ChevronDown, Menu, X, Sparkles, Trophy, BarChart3, Code2, BookOpen, FileText, Shield, GitBranch as GitBranchIcon, Users, Scale, Mail, CreditCard, FileCheck, KeyRound, Swords, Award, Github, Puzzle, ExternalLink, Plug } from 'lucide-react';
import { base44 } from '@/api/base44Client';

// One shared public navigation bar with a dropdown menu — used on every public page
// so navigation is consistent across the whole site (desktop + mobile).

const GROUPS = [
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

const INLINE = [
  { to: '/playground', label: 'Playground' },
  { to: '/leaderboard', label: 'Leaderboard' },
  { to: '/benchmark', label: 'Benchmark' },
  { to: '/pricing', label: 'Pricing' },
];

export default function PublicNav() {
  const [open, setOpen] = useState(false);
  const [authed, setAuthed] = useState(false);
  const { pathname } = useLocation();
  const ref = useRef(null);
  const dropRef = useRef(null);

  useEffect(() => { base44.auth.isAuthenticated().then(setAuthed).catch(() => setAuthed(false)); }, []);
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target) && dropRef.current && !dropRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <header className="border-b border-white/5 bg-[#070A0F]/90 backdrop-blur sticky top-0 z-40">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 h-14 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5 shrink-0">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center">
            <ShieldCheck className="h-4 w-4 text-[#070A0F]" strokeWidth={2.5} />
          </div>
          <span className="font-heading font-semibold text-white">Aether</span>
          <span className="text-[10px] uppercase tracking-[0.16em] text-slate-500 hidden lg:inline">The Truth Layer for AI</span>
        </Link>

        <div className="flex items-center gap-3" ref={ref}>
          <nav className="hidden md:flex items-center gap-4 text-xs">
            {INLINE.map((l) => (
              <Link key={l.to} to={l.to} className="text-slate-400 hover:text-white">{l.label}</Link>
            ))}
          </nav>
          {authed && <Link to="/console" className="hidden sm:inline-flex text-xs text-emerald-300 hover:text-emerald-200">Console</Link>}
          {!authed && <Link to="/login" className="hidden sm:inline-flex text-xs text-emerald-300 hover:text-emerald-200">Sign in</Link>}

          <button
            onClick={() => setOpen((o) => !o)}
            aria-label="Open menu"
            aria-expanded={open}
            className="h-9 px-2.5 inline-flex items-center gap-1.5 rounded-lg border border-white/10 text-slate-200 hover:bg-white/5 text-xs font-medium"
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            <span className="hidden sm:inline">Menu</span>
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {open && (
        <div ref={dropRef} className="absolute left-0 right-0 top-14 bg-[#0B0F16] border-b border-white/10 shadow-2xl">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-5 grid grid-cols-2 md:grid-cols-4 gap-5">
            {GROUPS.map((g) => (
              <div key={g.label}>
                <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500 mb-2 px-2">{g.label}</div>
                <div className="space-y-0.5">
                  {g.items.map((item) => {
                    const active = pathname === item.to;
                    return (
                      <Link
                        key={item.to}
                        to={item.to}
                        className={`flex items-center gap-2.5 px-2 py-2 rounded-lg text-[13px] transition-colors ${active ? 'bg-white/[0.06] text-white ring-1 ring-white/10' : 'text-slate-300 hover:text-white hover:bg-white/[0.04]'}`}
                      >
                        <item.Icon className={`h-3.5 w-3.5 ${active ? 'text-emerald-400' : 'text-slate-500'}`} />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="mx-auto max-w-6xl px-4 sm:px-6 pb-4 flex items-center justify-between">
            <Link to="/verify/demo" className="text-[11px] text-slate-500 hover:text-slate-300 inline-flex items-center gap-1">
              <ExternalLink className="h-3 w-3" /> Verify a proof
            </Link>
            {authed ? (
              <Link to="/console" className="text-xs text-emerald-300 hover:text-emerald-200">Open Console →</Link>
            ) : (
              <Link to="/register" className="text-xs text-emerald-300 hover:text-emerald-200">Get started free →</Link>
            )}
          </div>
        </div>
      )}
    </header>
  );
}