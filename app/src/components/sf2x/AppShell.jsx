import React, { useState, useEffect, createContext, useContext } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ShieldCheck, Rocket, MessageSquare, Trophy, CreditCard, ChevronDown, Menu, PanelLeft,
  FileText, Briefcase, ArrowLeft, Crosshair, Code2, LayoutDashboard, Info, Bot,
  Orbit, Fingerprint, Radio,
} from 'lucide-react';
import EpistemicCompass from '@/components/sf2x/EpistemicCompass';
import ScoreBadge from '@/components/sf2x/ScoreBadge';
import PullToRefresh from '@/components/sf2x/PullToRefresh';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import MobileTabBar from '@/components/sf2x/MobileTabBar';
import SkipLink, { RouteAnnouncer } from '@/components/aether/SkipLink';
import { prefetchProps } from '@/lib/design/prefetch';

const ShellContext = createContext(false);
export const useInsideShell = () => useContext(ShellContext);

// ACCESSIBILITY CONTRACT FOR THIS SHELL (the parts that are easy to lose in a refactor):
//
//  · <SkipLink> is the first focusable node in the document, and <main> carries the id it
//    targets. Twelve nav links ahead of the content is a toll only keyboard users pay.
//  · <RouteAnnouncer> moves focus into the new page's <h1> after every navigation and names
//    the page in a polite live region. Without it a route change is silent and focus stays
//    on a link that no longer exists.
//  · Active state is never colour alone: `aria-current="page"` plus a 2px left rule. The
//    background tint is the third signal, not the only one.
//  · Every icon-only control carries an aria-label. `title` is a tooltip, not an accessible
//    name — it is unreliable on touch and ignored by several screen readers.
//  · Focus is visible on a dark ground: #7DD3FC (11.51:1 on the card surface), the token
//    reserved for focus precisely so it can never be mistaken for an epistemic verdict.
//
// CONTRAST, measured against this shell's page ground #070A0F with the WCAG 2.1 formula:
//    #94A3B8 (slate-400) 7.73:1 · #78879E (TEXT.muted) 5.44:1 · #7DD3FC (focus) 11.7:1
//    #64748B (slate-500) 4.17:1 ✗ · #475569 (slate-600) 2.62:1 ✗
// The last two used to carry the brand tagline and the whole legal footer. They are gone.

const FOCUS_RING = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7DD3FC]/80 focus-visible:ring-offset-1 focus-visible:ring-offset-[#070A0F]';

const STANDALONE_LINKS = [
  { to: '/setup', label: 'Get Started', Icon: Rocket, color: 'text-emerald-400' },
  { to: '/integration-support', label: 'Agent', Icon: Bot, color: 'text-violet-400' },
  { to: '/console', label: 'Ask', Icon: MessageSquare, color: 'text-emerald-400' },
  { to: '/trust-center', label: 'Trust Center', Icon: ShieldCheck, color: 'text-sky-400' },
  { to: '/leaderboard', label: 'Showcase', Icon: Trophy, color: 'text-amber-400' },
  { to: '/portal', label: 'Account', Icon: CreditCard, color: 'text-indigo-400' },
  { to: '/developer', label: 'Developer Hub', Icon: Code2, color: 'text-violet-400' },
  { to: '/enterprise', label: 'Audit', Icon: Briefcase, color: 'text-orange-400' },
  { to: '/collective', label: 'Red Team', Icon: Crosshair, tone: 'red', color: 'text-rose-400' },
  { to: '/owner', label: 'Owner Dashboard', Icon: LayoutDashboard, color: 'text-teal-400' },
  { to: '/claims', label: 'Claims Registry', Icon: FileText, color: 'text-sky-400' },
  { to: '/guide', label: 'Guide', Icon: Info, color: 'text-blue-400' },
];

// The three public showcase surfaces. They live under their own heading because they are the
// proof, not another dashboard — and because they were previously unreachable by navigation.
const SHOWCASE_LINKS = [
  { to: '/cosmos', label: 'Cosmos', Icon: Orbit, color: 'text-violet-400' },
  { to: '/proof', label: 'Proof Theater', Icon: Fingerprint, color: 'text-sky-400' },
  { to: '/live', label: 'Live Tribunal', Icon: Radio, color: 'text-amber-400' },
];

const CATEGORIES = [];

function activeCategoryFor(pathname) {
  for (const c of CATEGORIES) {
    if (c.items.some((i) => i.to === pathname)) return c.key;
  }
  return null;
}

function Brand() {
  return (
    <div className="flex items-center gap-3 px-1">
      <div className="relative">
        <div className="absolute inset-0 blur-md bg-emerald-400/40 rounded-lg" aria-hidden="true" />
        <div className="relative h-9 w-9 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center">
          <ShieldCheck className="h-5 w-5 text-[#070A0F]" strokeWidth={2.5} aria-hidden="true" />
        </div>
      </div>
      <div>
        <div className="flex items-center gap-2 leading-none">
          <span className="font-heading text-lg font-semibold tracking-tight text-white">Aether</span>
          <ScoreBadge />
        </div>
        {/* was text-slate-500 — 4.17:1 on #070A0F, a fail at 10px. #78879E measures 5.44:1. */}
        <div className="text-[10px] uppercase tracking-[0.18em] text-[#78879E] mt-1">The Truth Layer for AI</div>
      </div>
    </div>
  );
}

function ShellLink({ item, onNavigate, dense = false }) {
  const { pathname } = useLocation();
  const active = pathname === item.to;
  const isRed = item.tone === 'red';

  return (
    <Link
      to={item.to}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      {...prefetchProps(item.to)}
      className={`flex items-center gap-2.5 rounded-lg border-l-2 pl-2 pr-2.5 font-medium transition-colors ${FOCUS_RING} ${
        dense ? 'py-2.5 md:py-1.5 text-[13px]' : 'py-2.5 md:py-2 text-[13px]'
      } ${
        isRed
          ? active
            ? 'border-rose-400 bg-rose-500/20 text-rose-200 ring-1 ring-rose-400/30'
            : 'border-transparent text-rose-300 hover:text-rose-200 hover:bg-rose-500/10'
          : active
            ? 'border-[#7DD3FC] bg-white/[0.06] text-white ring-1 ring-white/10'
            : 'border-transparent text-slate-300 hover:text-slate-100 hover:bg-white/[0.03]'
      }`}
    >
      <item.Icon className={`h-4 w-4 shrink-0 ${item.color || 'text-[#78879E]'}`} aria-hidden="true" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function NavLinks({ onNavigate, label = 'Primary' }) {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(() => {
    const a = activeCategoryFor(pathname);
    return a ? new Set([a]) : new Set();
  });

  useEffect(() => {
    const a = activeCategoryFor(pathname);
    if (a) setOpen((prev) => new Set(prev).add(a));
  }, [pathname]);

  const toggle = (key) => setOpen((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });

  return (
    <nav className="space-y-1 mt-6" aria-label={label}>
      {STANDALONE_LINKS.map((item) => (
        <ShellLink key={item.to} item={item} onNavigate={onNavigate} />
      ))}

      <div className="pt-3">
        <h2 className="px-2.5 pb-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-[#78879E]">
          Showcase
        </h2>
        <div className="space-y-1">
          {SHOWCASE_LINKS.map((item) => (
            <ShellLink key={item.to} item={item} onNavigate={onNavigate} />
          ))}
        </div>
      </div>

      {CATEGORIES.length > 0 && <div className="h-px bg-white/5 my-3" role="presentation" />}
      {CATEGORIES.map((cat) => {
        const isOpen = open.has(cat.key);
        const isActiveCat = cat.items.some((i) => i.to === pathname);
        return (
          <div key={cat.key} className="mb-1">
            <button
              type="button"
              onClick={() => toggle(cat.key)}
              aria-expanded={isOpen}
              className={`w-full flex items-center gap-2 px-2.5 py-2.5 md:py-2 rounded-lg text-xs font-medium transition-colors ${FOCUS_RING} ${
                isActiveCat ? 'text-white' : 'text-[#94A3B8] hover:text-slate-200'
              }`}
            >
              <cat.Icon className={`h-4 w-4 ${isActiveCat ? 'text-emerald-400' : 'text-[#78879E]'}`} aria-hidden="true" />
              <span className="uppercase tracking-[0.14em] flex-1 text-left">{cat.label}</span>
              <ChevronDown className={`h-3.5 w-3.5 text-[#78879E] transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
            </button>
            {isOpen && (
              <div className="ml-3 pl-3 border-l border-white/5 mt-1 space-y-0.5">
                {cat.items.map((item) => (
                  <ShellLink key={item.to} item={item} onNavigate={onNavigate} dense />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

export default function AppShell({ children }) {
  const isNested = useContext(ShellContext);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const TAB_ROOTS = ['/console', '/leaderboard', '/portal', '/trust-center', '/developer', '/owner', '/collective', '/guide', '/enterprise', '/setup', '/integration-support'];
  const showBack = !TAB_ROOTS.includes(pathname);

  if (isNested) return <>{children}</>;

  return (
    <ShellContext.Provider value={true}>
    <div className="min-h-screen bg-[#070A0F] text-slate-200 flex flex-col">
      {/* First focusable node in the document. Everything else follows it. */}
      <SkipLink />
      <RouteAnnouncer />

      <div className="flex flex-1">
        {/* Desktop sidebar — visible from medium widths up; toggleable with the side-tab button */}
        <aside
          className={collapsed ? 'hidden' : 'hidden md:flex flex-col w-60 shrink-0 border-r border-white/5 h-screen sticky top-0 overflow-y-auto p-4'}
          aria-label="Sidebar"
        >
          <Brand />
          <div className="mt-4 mb-2 flex justify-center"><EpistemicCompass /></div>
          <NavLinks label="Primary" />
        </aside>

        {/* Main column */}
        <div className="flex-1 min-w-0">
          {/* Mobile top bar — show-side-tab button opens the drawer */}
          <header className="md:hidden flex items-center justify-between px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] border-b border-white/5 sticky top-0 bg-[#070A0F]/90 backdrop-blur z-20">
            <div className="flex items-center gap-1">
              <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                <SheetTrigger asChild>
                  <button
                    type="button"
                    className={`h-11 w-11 flex items-center justify-center rounded-lg text-slate-300 hover:bg-white/5 ${FOCUS_RING}`}
                    aria-label="Open navigation menu"
                  >
                    <Menu className="h-5 w-5" aria-hidden="true" />
                  </button>
                </SheetTrigger>
                <SheetContent side="left" className="w-72 bg-[#0B0F16] border-white/10 text-slate-200 p-4">
                  <Brand />
                  <div className="mt-4 mb-2 flex justify-center"><EpistemicCompass /></div>
                  <NavLinks onNavigate={() => setMobileOpen(false)} label="Primary, in the navigation drawer" />
                </SheetContent>
              </Sheet>
              {showBack && (
                <button
                  type="button"
                  onClick={() => navigate(-1)}
                  className={`h-11 w-11 flex items-center justify-center rounded-lg text-slate-300 hover:bg-white/5 ${FOCUS_RING}`}
                  aria-label="Go back to the previous page"
                >
                  <ArrowLeft className="h-5 w-5" aria-hidden="true" />
                </button>
              )}
              <span className="font-heading text-sm font-semibold tracking-tight text-white ml-1">AETHER</span>
            </div>
          </header>

          {/* Desktop header — toggle + back, plus logo/compass/red-team when sidebar is collapsed */}
          <header className="hidden md:flex items-center gap-3 px-6 pb-2 pt-[max(1rem,env(safe-area-inset-top))]">
            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              className={`p-1.5 rounded-lg text-slate-300 hover:bg-white/5 ${FOCUS_RING}`}
              aria-label={collapsed ? 'Show the sidebar' : 'Hide the sidebar'}
              aria-expanded={!collapsed}
              title={collapsed ? 'Show sidebar' : 'Hide sidebar'}
            >
              <PanelLeft className="h-5 w-5" aria-hidden="true" />
            </button>
            {showBack && (
              <button
                type="button"
                onClick={() => navigate(-1)}
                className={`p-1.5 rounded-lg text-slate-300 hover:bg-white/5 ${FOCUS_RING}`}
                aria-label="Go back to the previous page"
                title="Back"
              >
                <ArrowLeft className="h-5 w-5" aria-hidden="true" />
              </button>
            )}
            {collapsed && (
              <>
                <div className="ml-2"><Brand /></div>
                <div className="ml-2"><EpistemicCompass /></div>
                <Link
                  to="/collective"
                  {...prefetchProps('/collective')}
                  className={`ml-auto inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-[13px] font-medium text-rose-300 hover:text-rose-200 hover:bg-rose-500/10 ring-1 ring-rose-400/30 ${FOCUS_RING}`}
                >
                  <Crosshair className="h-4 w-4 text-rose-400" aria-hidden="true" /> Red Team
                </Link>
              </>
            )}
          </header>

          <main
            id="main-content"
            className="px-4 sm:px-6 lg:px-8 pt-6 pb-[calc(6.5rem+env(safe-area-inset-bottom))] md:pb-6 max-w-7xl mx-auto w-full"
          >
            <PullToRefresh onRefresh={() => window.location.reload()}>
              {children}
            </PullToRefresh>
          </main>
        </div>
      </div>

      <MobileTabBar />
      <LegalFooter />
    </div>
    </ShellContext.Provider>
  );
}

function LegalFooter() {
  const links = [
    { to: '/about', label: 'About' },
    { to: '/contact', label: 'Contact' },
    { to: '/pricing', label: 'Pricing' },
    { to: '/terms', label: 'Terms' },
    { to: '/privacy', label: 'Privacy' },
  ];
  return (
    // was text-slate-600 (2.62:1) with text-slate-500 links — both failed AA outright.
    // Body copy is now #78879E (5.44:1) and the links #94A3B8 (7.73:1).
    <footer className="hidden border-t border-white/10 bg-[#0B0F16] px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-center text-[10px] text-[#78879E] md:block">
      <nav aria-label="Legal and company" className="flex items-center justify-center gap-4 mb-1.5">
        {links.map((l) => (
          <Link
            key={l.to}
            to={l.to}
            {...prefetchProps(l.to)}
            className={`rounded text-[#94A3B8] hover:text-white ${FOCUS_RING}`}
          >
            {l.label}
          </Link>
        ))}
      </nav>
      AETHER by SF2X — Every answer is warranted, lineage-tracked, and epistemically scored.
    </footer>
  );
}
