import React, { useState, useEffect, useRef, createContext, useContext } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ShieldCheck, Sparkles, Scale, UserCircle, Rocket,
  MessageSquare, GitBranch, Activity, Trophy, Gavel, Server, Swords,
  CreditCard, Crown, Wrench, BookOpen, ChevronDown, Menu, PanelLeft, Radar, Waves, FileText, Briefcase, ArrowLeft, Crosshair,
  BarChart3, Webhook, FileSpreadsheet, Code2, FileCheck, KeyRound, Mail, History, LayoutDashboard, Info, Bot,
} from 'lucide-react';
import EpistemicCompass from '@/components/sf2x/EpistemicCompass';
import ScoreBadge from '@/components/sf2x/ScoreBadge';
import PullToRefresh from '@/components/sf2x/PullToRefresh';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import MobileTabBar from '@/components/sf2x/MobileTabBar';

const ShellContext = createContext(false);
export const useInsideShell = () => useContext(ShellContext);

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
        <div className="absolute inset-0 blur-md bg-emerald-400/40 rounded-lg" />
        <div className="relative h-9 w-9 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center">
          <ShieldCheck className="h-5 w-5 text-[#070A0F]" strokeWidth={2.5} />
        </div>
      </div>
      <div>
        <div className="flex items-center gap-2 leading-none">
          <span className="font-heading text-lg font-semibold tracking-tight text-white">Aether</span>
          <ScoreBadge />
        </div>
        <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 mt-1">The Truth Layer for AI</div>
      </div>
    </div>
  );
}

function NavLinks({ onNavigate }) {
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
    <nav className="space-y-1 mt-6">
      {STANDALONE_LINKS.map((item) => {
        const active = pathname === item.to;
        const isRed = item.tone === 'red';
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={`flex items-center gap-2.5 px-2.5 py-2.5 md:py-2 rounded-lg text-[13px] font-medium transition-colors ${
              isRed
                ? active
                  ? 'bg-rose-500/20 text-rose-300 ring-1 ring-rose-400/30'
                  : 'text-rose-300 hover:text-rose-200 hover:bg-rose-500/10'
                : active
                  ? 'bg-white/[0.06] text-white ring-1 ring-white/10'
                  : 'text-slate-300 hover:text-slate-100 hover:bg-white/[0.03]'
            }`}
          >
            <item.Icon className={`h-4 w-4 ${item.color}`} />
            {item.label}
          </Link>
        );
      })}
      {CATEGORIES.length > 0 && <div className="h-px bg-white/5 my-3" />}
      {CATEGORIES.map((cat) => {
        const isOpen = open.has(cat.key);
        const isActiveCat = cat.items.some((i) => i.to === pathname);
        return (
          <div key={cat.key} className="mb-1">
            <button
              onClick={() => toggle(cat.key)}
              className={`w-full flex items-center gap-2 px-2.5 py-2.5 md:py-2 rounded-lg text-xs font-medium transition-colors ${
                isActiveCat ? 'text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <cat.Icon className={`h-4 w-4 ${isActiveCat ? 'text-emerald-400' : 'text-slate-500'}`} />
              <span className="uppercase tracking-[0.14em] flex-1 text-left">{cat.label}</span>
              <ChevronDown className={`h-3.5 w-3.5 text-slate-600 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && (
              <div className="ml-3 pl-3 border-l border-white/5 mt-1 space-y-0.5">
                {cat.items.map((item) => {
                  const active = pathname === item.to;
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={onNavigate}
                      className={`flex items-center gap-2.5 px-2.5 py-2.5 md:py-1.5 rounded-lg text-[13px] transition-colors ${
                        active
                          ? 'bg-white/[0.06] text-white ring-1 ring-white/10'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]'
                      }`}
                    >
                      <item.Icon className={`h-3.5 w-3.5 ${active ? 'text-emerald-400' : 'text-slate-600'}`} />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

function Footer() {
  return (
    <div className="pt-4 border-t border-white/5 text-[10px] text-slate-600 leading-relaxed px-1">
      <div className="flex items-center gap-3 mb-2">
        <Link to="/about" className="text-slate-500 hover:text-slate-300">About</Link>
        <Link to="/contact" className="text-slate-500 hover:text-slate-300">Contact</Link>
        <Link to="/developer" className="text-slate-500 hover:text-slate-300">Developer</Link>
        <Link to="/pricing" className="text-slate-500 hover:text-slate-300">Pricing</Link>
        <Link to="/terms" className="text-slate-500 hover:text-slate-300">Terms</Link>
        <Link to="/privacy" className="text-slate-500 hover:text-slate-300">Privacy</Link>
      </div>
      AETHER by SF2X v0.1<br />Every answer is warranted, lineage-tracked, and epistemically scored.
    </div>
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
      <div className="flex flex-1">
        {/* Desktop sidebar — visible from medium widths up; toggleable with the side-tab button */}
        <aside className={collapsed ? 'hidden' : 'hidden md:flex flex-col w-60 shrink-0 border-r border-white/5 h-screen sticky top-0 overflow-y-auto p-4'}>
          <Brand />
          <div className="mt-4 mb-2 flex justify-center"><EpistemicCompass /></div>
          <NavLinks />
        </aside>

        {/* Main column */}
        <div className="flex-1 min-w-0">
          {/* Mobile top bar — show-side-tab button opens the drawer */}
          <header className="md:hidden flex items-center justify-between px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] border-b border-white/5 sticky top-0 bg-[#070A0F]/90 backdrop-blur z-20">
            <div className="flex items-center gap-1">
              <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                <SheetTrigger asChild>
                  <button className="h-11 w-11 flex items-center justify-center rounded-lg text-slate-300 hover:bg-white/5" title="Show sidebar" aria-label="Show navigation">
                    <Menu className="h-5 w-5" />
                  </button>
                </SheetTrigger>
                <SheetContent side="left" className="w-72 bg-[#0B0F16] border-white/10 text-slate-200 p-4">
                  <Brand />
                  <div className="mt-4 mb-2 flex justify-center"><EpistemicCompass /></div>
                  <NavLinks onNavigate={() => setMobileOpen(false)} />
                </SheetContent>
              </Sheet>
              {showBack && (
                <button onClick={() => navigate(-1)} className="h-11 w-11 flex items-center justify-center rounded-lg text-slate-300 hover:bg-white/5" title="Back" aria-label="Go back">
                  <ArrowLeft className="h-5 w-5" />
                </button>
              )}
              <span className="font-heading text-sm font-semibold tracking-tight text-white ml-1">AETHER</span>
            </div>
          </header>

          {/* Desktop header — toggle + back, plus logo/compass/red-team when sidebar is collapsed */}
          <header className="hidden md:flex items-center gap-3 px-6 pb-2 pt-[max(1rem,env(safe-area-inset-top))]">
            <button
              onClick={() => setCollapsed((c) => !c)}
              className="p-1.5 rounded-lg text-slate-300 hover:bg-white/5"
              title={collapsed ? 'Show sidebar' : 'Hide sidebar'}
            >
              <PanelLeft className="h-5 w-5" />
            </button>
            {showBack && (
              <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg text-slate-300 hover:bg-white/5" title="Back">
                <ArrowLeft className="h-5 w-5" />
              </button>
            )}
            {collapsed && (
              <>
                <div className="ml-2"><Brand /></div>
                <div className="ml-2"><EpistemicCompass /></div>
                <Link
                  to="/collective"
                  className="ml-auto inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-[13px] font-medium text-rose-300 hover:text-rose-200 hover:bg-rose-500/10 ring-1 ring-rose-400/30"
                >
                  <Crosshair className="h-4 w-4 text-rose-400" /> Red Team
                </Link>
              </>
            )}
          </header>

          <main className="px-4 sm:px-6 lg:px-8 pt-6 pb-[calc(6.5rem+env(safe-area-inset-bottom))] md:pb-6 max-w-7xl mx-auto w-full">
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
  return (
    <footer className="hidden border-t border-white/10 bg-[#0B0F16] px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-center text-[10px] text-slate-600 md:block">
      <div className="flex items-center justify-center gap-4 mb-1.5">
        <Link to="/about" className="hover:text-slate-400">About</Link>
        <Link to="/contact" className="hover:text-slate-400">Contact</Link>
        <Link to="/pricing" className="hover:text-slate-400">Pricing</Link>
        <Link to="/terms" className="hover:text-slate-400">Terms</Link>
        <Link to="/privacy" className="hover:text-slate-400">Privacy</Link>
      </div>
      AETHER by SF2X — Every answer is warranted, lineage-tracked, and epistemically scored.
    </footer>
  );
}