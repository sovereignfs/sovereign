'use client';

import { useEffect, useState } from 'react';

export type TransitionPhase = 'entering' | 'open' | 'closing' | 'closed';

/**
 * useMountTransition — generic two-phase-mount state machine for animated
 * overlays (Dialog, Drawer, and their Phase-B successors: Sheet,
 * ConfirmDialog, Menu). Internal to the design system — not exported from
 * `index.ts`; each component wires its own CSS classes to the returned phase.
 *
 * The `open` prop controls mounting from the outside, but both directions need
 * two renders to actually animate rather than snap: entering needs a frame at
 * the closed-position styles before flipping to open (so the browser has
 * something to interpolate from), and exiting needs to stay mounted *after*
 * `open` goes false long enough to play in reverse — so `mounted` and `open`
 * diverge for `durationMs` on close:
 *
 *   open=true  -> phase 'entering' (closed-position styles — this applies
 *                 equally to a fresh mount that starts open, e.g. a
 *                 route-driven overlay, and to an existing instance whose
 *                 `open` prop just flipped true; both should animate in the
 *                 same way) -> next frame, phase 'open' (open-position styles;
 *                 the CSS transition between the two animates the entrance).
 *   open=false -> phase 'closing' (still mounted, rendered back at the
 *                 closed-position styles so the transition reverses) -> after
 *                 durationMs, phase 'closed' (unmounts).
 *
 * A component only needs one conditional class: apply the "open" variant
 * when `phase === 'open'`, and leave the base (closed-position) styles as the
 * unconditional default — entering, closing, and the pre-transition instant
 * all render as that same base state, which is exactly what should animate
 * to/from.
 */
export function useMountTransition(
  open: boolean,
  durationMs: number,
): { mounted: boolean; phase: TransitionPhase } {
  const [phase, setPhase] = useState<TransitionPhase>(open ? 'entering' : 'closed');

  useEffect(() => {
    if (open) {
      setPhase('entering');
      const raf = requestAnimationFrame(() => setPhase('open'));
      return () => cancelAnimationFrame(raf);
    }
    setPhase((p) => (p === 'closed' ? 'closed' : 'closing'));
    const timer = setTimeout(() => setPhase('closed'), durationMs);
    return () => clearTimeout(timer);
  }, [open, durationMs]);

  return { mounted: phase !== 'closed', phase };
}

/**
 * usePrefersReducedMotion — SSR-safe (defaults to `false` until the client
 * mounts, matching every other SSR-safe hook in this system). Components pair
 * this with a `durationMs` of ~0 passed to `useMountTransition` and a matching
 * `@media (prefers-reduced-motion: reduce)` CSS rule collapsing the same
 * transition to near-instant — both sides must agree, or the JS unmount timer
 * and the CSS animation duration drift apart.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mql.matches);
    function handleChange(e: MediaQueryListEvent) {
      setReduced(e.matches);
    }
    mql.addEventListener('change', handleChange);
    return () => mql.removeEventListener('change', handleChange);
  }, []);

  return reduced;
}
