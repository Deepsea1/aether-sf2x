import { useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { Loader2, ArrowDown } from 'lucide-react';

// Simple pull-to-refresh: when the page is scrolled to the top and the user
// drags downward, the content follows the finger; releasing past the threshold
// triggers onRefresh. Best-effort and mobile-only (touch driven).
export default function PullToRefresh({ onRefresh, children }) {
  const y = useMotionValue(0);
  const opacity = useTransform(y, [0, 10, 40], [0, 0, 1]);
  const rotate = useTransform(y, [0, 70], [180, 0]);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(null);
  const refreshRef = useRef(onRefresh);
  refreshRef.current = onRefresh;
  const threshold = 70;

  useEffect(() => {
    const scrollTop = () => window.scrollY || document.documentElement.scrollTop;

    function onTouchStart(e) {
      if (scrollTop() <= 0 && !refreshing) startY.current = e.touches[0].clientY;
    }
    function onTouchMove(e) {
      if (startY.current == null || refreshing) return;
      if (scrollTop() > 0) { startY.current = null; return; }
      const dy = e.touches[0].clientY - startY.current;
      if (dy > 0) y.set(Math.min(dy * 0.5, 100));
    }
    async function onTouchEnd() {
      if (startY.current == null) return;
      startY.current = null;
      const pulled = y.get();
      if (pulled >= threshold && !refreshing) {
        setRefreshing(true);
        animate(y, threshold, { duration: 0.2 });
        try { await (refreshRef.current ? refreshRef.current() : Promise.resolve()); } catch {}
        animate(y, 0, { duration: 0.25 });
        setRefreshing(false);
      } else {
        animate(y, 0, { duration: 0.2 });
      }
    }

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd);
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [y, refreshing]);

  return (
    <motion.div style={{ y }} className="relative">
      <motion.div style={{ opacity }} className="absolute left-1/2 -translate-x-1/2 -top-7 flex items-center justify-center">
        <motion.div style={{ rotate }}>
          {refreshing
            ? <Loader2 className="h-5 w-5 text-emerald-400 animate-spin" />
            : <ArrowDown className="h-5 w-5 text-slate-400" />}
        </motion.div>
      </motion.div>
      {children}
    </motion.div>
  );
}