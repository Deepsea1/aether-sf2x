import { useEffect, useState } from 'react';

// prefers-reduced-motion, read once and then kept live. SSR-safe: when there is
// no window (or no matchMedia, e.g. very old browsers) we report `false` so the
// app renders its normal path rather than silently stripping information.
//
// Callers must treat `true` as "make the state change instant", never as
// "remove the state change" — MASTER_PLAN v5 §25.3 rule 8.

const QUERY = '(prefers-reduced-motion: reduce)';

/** @returns {boolean} */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia(QUERY).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mql = window.matchMedia(QUERY);
    const onChange = (event) => setReduced(!!event.matches);
    setReduced(mql.matches);
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    }
    // Safari < 14
    mql.addListener(onChange);
    return () => mql.removeListener(onChange);
  }, []);

  return reduced;
}

export default useReducedMotion;
