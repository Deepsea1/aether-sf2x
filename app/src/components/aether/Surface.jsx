import React from 'react';
import { cn } from '@/lib/utils';
import { glowFor } from '@/lib/design/tokens';

// The canonical card shell — the dark-card idiom used across the app, in one place so a
// page never has to re-type the border/background/padding triplet. `className` is merged
// with tailwind-merge, so `<Surface className="p-0">` genuinely wins.
//
// `glow` is deliberately restrained: a wide, low-alpha radial wash that reads as depth,
// not neon, painted UNDER the content (never washing out text). It defaults to a neutral
// cool tint — a green glow on an arbitrary card would say "supported" to the eye, and
// only the epistemic state is allowed to say that. Pass a state key to tint it
// intentionally: <Surface glow="contested">. Remember law #4 — brightness is authority
// and freshness, never "this node has a lot of edges".

const TONES = {
  default: 'border-white/10 bg-[#0B0F16]',
  raised: 'border-white/[0.14] bg-[#111827] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset,0_18px_40px_-24px_rgba(0,0,0,0.9)]',
  inset: 'border-white/[0.06] bg-[#080B11]',
};

const NEUTRAL_GLOW = 'rgba(148,180,255,0.10)';

export default function Surface({
  tone = 'default',
  glow = false,
  as: Comp = 'div',
  className,
  children,
  ...rest
}) {
  const glowColor = typeof glow === 'string' ? glowFor(glow) : NEUTRAL_GLOW;

  return (
    <Comp
      className={cn('relative isolate rounded-2xl border p-5', TONES[tone] || TONES.default, className)}
      {...rest}
    >
      {glow ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 rounded-[inherit]"
          style={{ background: `radial-gradient(125% 85% at 50% -25%, ${glowColor}, transparent 68%)` }}
        />
      ) : null}
      {children}
    </Comp>
  );
}
