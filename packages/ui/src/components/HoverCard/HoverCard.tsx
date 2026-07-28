'use client';

import { cloneElement, useEffect, useRef, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { Popover } from '../Popover/Popover';
import styles from './HoverCard.module.css';

export interface HoverCardProps {
  /** The element that opens the card — cloned with hover/focus handlers
   * (desktop) or a tap handler (touch). */
  trigger: ReactElement;
  children: ReactNode;
  align?: 'left' | 'right';
  width?: number | 'trigger';
  'aria-label': string;
}

const OPEN_DELAY_MS = 400;
const CLOSE_DELAY_MS = 150;

/** Whether the primary pointer can hover. Distinct from viewport-width-based
 * mobile detection: a touchscreen laptop with a mouse as its primary
 * pointer should still get real hover behavior, and a large-viewport tablet
 * with only touch should not — viewport width doesn't capture that, `(hover:
 * hover)` does, matching the pointer-based gating this design system already
 * uses in CSS (e.g. Button/Checkbox's touch-target expansion). Defaults to
 * `true`: this only changes which event handlers get attached, not the
 * initial DOM shape, so there's no hydration-mismatch risk to guard against
 * the way `useIsMobile` does. */
function useHoverCapable(): boolean {
  const [hoverCapable, setHoverCapable] = useState(true);

  useEffect(() => {
    const mql = window.matchMedia('(hover: hover)');
    setHoverCapable(mql.matches);
    function handleChange(e: MediaQueryListEvent) {
      setHoverCapable(e.matches);
    }
    mql.addEventListener('change', handleChange);
    return () => mql.removeEventListener('change', handleChange);
  }, []);

  return hoverCapable;
}

/**
 * HoverCard — hover-triggered popover on desktop, tap-to-toggle on touch.
 *
 * Built on `Popover` rather than reimplementing positioning/collision
 * detection: this only adds the hover-intent open/close timing (avoids
 * flicker on an accidental mouse pass-over, and gives the pointer time to
 * travel from the trigger to the card itself across the gap between them)
 * and the touch fallback. Also opens on keyboard focus and closes on blur —
 * a hover-only trigger is a WCAG failure, since keyboard users can't hover.
 */
export function HoverCard({
  trigger,
  children,
  align,
  width,
  'aria-label': ariaLabel,
}: HoverCardProps) {
  const [open, setOpen] = useState(false);
  const hoverCapable = useHoverCapable();
  const openTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function scheduleOpen() {
    clearTimeout(closeTimer.current);
    openTimer.current = setTimeout(() => setOpen(true), OPEN_DELAY_MS);
  }

  function scheduleClose() {
    clearTimeout(openTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  }

  function cancelScheduledClose() {
    clearTimeout(closeTimer.current);
  }

  const triggerHandlers = hoverCapable
    ? {
        onMouseEnter: scheduleOpen,
        onMouseLeave: scheduleClose,
        onFocus: () => setOpen(true),
        onBlur: scheduleClose,
      }
    : { onClick: () => setOpen((o) => !o) };

  const wrappedTrigger = cloneElement(trigger, triggerHandlers);

  return (
    <div
      className={styles.root}
      onMouseEnter={hoverCapable ? cancelScheduledClose : undefined}
      onMouseLeave={hoverCapable ? scheduleClose : undefined}
    >
      <Popover
        trigger={wrappedTrigger}
        open={open}
        onClose={() => setOpen(false)}
        align={align}
        width={width}
        aria-label={ariaLabel}
      >
        {children}
      </Popover>
    </div>
  );
}
