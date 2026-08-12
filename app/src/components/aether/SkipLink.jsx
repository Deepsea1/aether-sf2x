import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { CornerDownRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FOCUS, SURFACE, TEXT } from '@/lib/design/tokens';
import { titleFor } from '@/lib/design/prefetch';

// THE FIRST THING IN THE TAB ORDER, AND THE THING THAT MOVES FOCUS AFTER A NAVIGATION.
//
// Two problems live here because they are the same problem — "where am I, and how do I get
// past the chrome" — and both are invisible to anyone using a mouse.
//
// 1 · SKIP LINK. Aether's shell puts a brand, a compass and up to twelve nav links ahead of
//     the content. A keyboard or switch user pays that toll on every single page. The skip
//     link is off-screen until it is focused, then it is a real, opaque, high-contrast
//     control — not a 1px ghost. It is deliberately NOT `sr-only` when focused: sighted
//     keyboard users are the majority of its users.
//
// 2 · ROUTE FOCUS. A single-page app changes the whole document without telling assistive
//     technology, so focus stays on the link that was clicked — which no longer exists — and
//     the reader announces nothing. `RouteAnnouncer` fixes both halves: it moves focus to the
//     new page's <h1> (so the next Tab continues *inside* the new page, and the reader speaks
//     the heading), and it names the page in a polite live region for readers whose focus
//     handling is unreliable. It also sets the document title, which is what a browser's tab
//     strip, history and bookmark all read.
//
// HONEST BOUNDARY on reduced motion: neither of these is an animation. Focus movement is
// already instant, and `preventScroll: true` hands scrolling to <ScrollToTop>, which owns it.
// Nothing here has anything to collapse — and nothing here may be *removed* under reduced
// motion, because the information is the whole point.
//
// FALLBACK BY DESIGN: the target is looked up as `#main-content`, then any <main>, then the
// first <h1>. Pages this component cannot edit still get the behaviour.

const MAIN_ID = 'main-content';

/**
 * Run `fn` once, after React has had a chance to commit — racing an animation frame against a
 * timer and taking whichever arrives first.
 *
 * `requestAnimationFrame` alone is the obvious choice and it is not sufficient: rAF is tied to
 * COMPOSITING, so it never fires in a background tab, in an embedded webview that is not being
 * painted, or under some power-saving modes. Measured in exactly such an environment while
 * building this: rAF fired 0 times while setTimeout fired normally. Accessibility must not be
 * the thing that silently stops working when the browser decides not to paint — a screen
 * reader user restoring a background tab still needs the announcement.
 *
 * @param {() => void} fn
 * @returns {() => void} teardown
 */
function afterPaint(fn) {
  let done = false;
  const run = () => { if (done) return; done = true; fn(); };
  const frame = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(run) : null;
  const timer = setTimeout(run, 32);
  return () => {
    done = true;
    if (frame !== null) cancelAnimationFrame(frame);
    clearTimeout(timer);
  };
}

/** Resolve the page's main landmark without requiring every page to opt in. */
function resolveMain(id = MAIN_ID) {
  if (typeof document === 'undefined') return null;
  return document.getElementById(id) || document.querySelector('main') || null;
}

/**
 * Focus an element that was never meant to be focusable, then hand tabbing back to the
 * document. `tabindex="-1"` is added only for the duration of the focus and removed on blur,
 * so we never leave stray, un-tabbable-but-focusable nodes behind in the DOM.
 */
function focusQuietly(el) {
  if (!el) return;
  const hadTabIndex = el.hasAttribute('tabindex');
  if (!hadTabIndex) el.setAttribute('tabindex', '-1');
  el.focus({ preventScroll: true });
  if (!hadTabIndex) {
    el.addEventListener('blur', () => el.removeAttribute('tabindex'), { once: true });
  }
}

/**
 * Move focus to the page's main content — the heading if there is one, the landmark if not.
 * Exported so a shell can call it directly (e.g. after closing a menu).
 * @param {string} [id]
 * @returns {boolean} whether anything was focused
 */
export function focusMainLandmark(id = MAIN_ID) {
  const main = resolveMain(id);
  const target = main?.querySelector('h1') || main || document.querySelector('h1');
  if (!target) return false;
  focusQuietly(target);
  return true;
}

/**
 * Skips the navigation chrome. Must be the first focusable element in the document, so it is
 * rendered at the very top of each shell.
 */
export default function SkipLink({ targetId = MAIN_ID, children = 'Skip to main content', className }) {
  const onActivate = (event) => {
    const main = resolveMain(targetId);
    if (!main) return;                                  // let the plain #hash try instead
    event.preventDefault();
    focusQuietly(main);
    main.scrollIntoView({ block: 'start', behavior: 'auto' });
  };

  return (
    <a
      href={`#${targetId}`}
      onClick={onActivate}
      className={cn(
        'sr-only',
        // When focused it stops being screen-reader-only and becomes a solid control.
        'focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100]',
        'focus:inline-flex focus:h-auto focus:w-auto focus:items-center focus:gap-2',
        'focus:overflow-visible focus:whitespace-nowrap focus:rounded-xl focus:border',
        'focus:px-4 focus:py-2.5 focus:text-sm focus:font-medium',
        'focus:shadow-[0_18px_40px_-18px_rgba(0,0,0,0.95)] focus:outline-none',
        className,
      )}
      style={{
        // Inline so the focused pill cannot be defeated by a page's own cascade.
        // #E8EEF7 on #111827 measures 15.19:1 — far past AAA, which is the right call for a
        // control most people will only ever see for a fraction of a second.
        color: TEXT.primary,
        backgroundColor: SURFACE.raised,
        borderColor: FOCUS,
        boxShadow: `0 0 0 3px ${FOCUS}55`,
      }}
    >
      <CornerDownRight className="h-4 w-4 shrink-0" aria-hidden="true" style={{ color: FOCUS }} />
      {children}
    </a>
  );
}

// MODULE scope, not component state — and this is load-bearing.
//
// <RouteAnnouncer> is mounted BY each page (through AppShell or PublicNav), and the router
// swaps the whole tree on navigation, so this component unmounts and remounts on every single
// route change. A per-instance `useRef(true)` "is this the first render" guard is therefore
// true EVERY time, which means focus would never move — the exact bug this component exists
// to fix, silently reintroduced. Verified in a browser: the ref version never moved focus once.
//
// Tracking the last announced path at module scope survives the remount, and dedupes for free
// if two shells ever mount an announcer at the same time.
let lastAnnouncedPath = null;

/**
 * Sets the document title, moves focus into the new page, and announces it politely.
 * Renders one visually-hidden live region and nothing else. Mount once per shell.
 */
export function RouteAnnouncer({ mainId = MAIN_ID }) {
  const { pathname } = useLocation();
  const [spoken, setSpoken] = useState('');

  useEffect(() => {
    const title = titleFor(pathname);
    document.title = title;

    if (lastAnnouncedPath === pathname) return undefined;   // a remount, not a navigation
    const isFirstEverRender = lastAnnouncedPath === null;
    lastAnnouncedPath = pathname;

    // On the very first paint the browser has already put focus where the user expects it
    // (the address bar, or a deep link's target). Stealing it would be the rude version of
    // being helpful — so the first load only sets the title.
    if (isFirstEverRender) return undefined;

    // One frame of slack: the new route's <h1> does not exist until React has committed it,
    // and a lazy route may still be showing its Suspense fallback.
    const cancel = afterPaint(() => {
      focusMainLandmark(mainId);
      // Clearing first guarantees the region's text actually *changes*, which is what makes
      // a screen reader speak it. Two identical strings in a row are silently ignored.
      setSpoken('');
      afterPaint(() => setSpoken(title));
    });
    return cancel;
  }, [pathname, mainId]);

  return (
    <div aria-live="polite" aria-atomic="true" role="status" className="sr-only">
      {spoken}
    </div>
  );
}
