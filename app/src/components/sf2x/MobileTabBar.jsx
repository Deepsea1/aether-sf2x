import React, { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { MessageSquare, ShieldCheck, Trophy, CreditCard, Info } from 'lucide-react';

const TABS = [
  { to: '/console', label: 'Ask', Icon: MessageSquare, color: 'text-emerald-400' },
  { to: '/trust-center', label: 'Trust', Icon: ShieldCheck, color: 'text-sky-400' },
  { to: '/leaderboard', label: 'Showcase', Icon: Trophy, color: 'text-amber-400' },
  { to: '/portal', label: 'Account', Icon: CreditCard, color: 'text-indigo-400' },
  { to: '/guide', label: 'Guide', Icon: Info, color: 'text-blue-400' },
];

// Which tab root (if any) a pathname belongs to — exact match or a sub-route.
function rootFor(pathname) {
  for (const t of TABS) {
    if (pathname === t.to || pathname.startsWith(t.to + '/')) return t.to;
  }
  return null;
}

export default function MobileTabBar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  // Per-tab memory of the last visited path, so switching back to a tab
  // restores its sub-route context instead of always landing on the root.
  const lastPaths = useRef({});

  useEffect(() => {
    const root = rootFor(pathname);
    if (root) lastPaths.current[root] = pathname;
  }, [pathname]);

  const handleTab = (to) => {
    const currentRoot = rootFor(pathname);
    const isActive = currentRoot === to;
    if (isActive) {
      // Tapping the already-active tab resets it to its root path.
      if (pathname !== to) navigate(to, { replace: true });
      return;
    }
    // Switching tabs: restore that tab's last sub-route, or its root.
    navigate(lastPaths.current[to] || to);
  };

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-[#0B0F16]/95 backdrop-blur pb-[env(safe-area-inset-bottom)] md:hidden">
      <div className="grid grid-cols-5">
        {TABS.map((t) => {
          const active = rootFor(pathname) === t.to;
          return (
            <button
              key={t.to}
              type="button"
              onClick={() => handleTab(t.to)}
              aria-label={t.label}
              aria-current={active ? 'page' : undefined}
              className={`flex flex-col items-center justify-center gap-0.5 min-h-[56px] pt-2 ${active ? 'text-white' : 'text-slate-500'}`}
            >
              <t.Icon className={`h-5 w-5 ${active ? t.color : 'text-slate-500'}`} />
              <span className="text-[10px] font-medium">{t.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}