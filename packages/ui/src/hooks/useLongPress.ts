'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';

export interface UseLongPressOptions {
  /** Called once the press has been held for `delay` without exceeding `moveTolerance`. */
  onLongPress: () => void;
  /** Hold duration in ms before `onLongPress` fires. Default 500. */
  delay?: number;
  /** Accumulated pointer movement (px) that cancels a pending press. Default 10 —
   *  a real finger jitters a couple of px on a still hold; this must be forgiving
   *  of that or the gesture never fires. */
  moveTolerance?: number;
  /** How long (ms) after firing to swallow the click that may or may not follow.
   *  Default 700. Time-boxed rather than "clear on next click" — iOS frequently
   *  sends no click at all after a long hold, so a flag that only clears on the
   *  next click stays armed forever and silently eats the user's next real tap. */
  suppressClickMs?: number;
  /** Fire `navigator.vibrate(10)` when the press triggers, where supported. Default true. */
  vibrate?: boolean;
  /** Skip entirely (hooks can't be called conditionally, so this is the escape hatch
   *  for a caller whose long-press action isn't available in the current state). */
  disabled?: boolean;
}

export interface LongPressHandlers {
  onPointerDown: (e: ReactPointerEvent) => void;
  onPointerMove: (e: ReactPointerEvent) => void;
  onPointerUp: (e: ReactPointerEvent) => void;
  onPointerCancel: (e: ReactPointerEvent) => void;
  onPointerLeave: (e: ReactPointerEvent) => void;
  onContextMenu: (e: ReactMouseEvent) => void;
  onClick: (e: ReactMouseEvent) => void;
  /** Spread onto the target element. Empty on devices whose primary pointer
   *  isn't coarse (desktop mouse/trackpad) — see the coarse-pointer gate below. */
  style: CSSProperties;
}

const DEFAULT_DELAY_MS = 500;
const DEFAULT_MOVE_TOLERANCE_PX = 10;
const DEFAULT_SUPPRESS_CLICK_MS = 700;

// SSR-safe, same defer-to-client-mount pattern as useIsMobile: defaults to
// false (no suppression styles) until the client can actually read the
// device's primary pointer, avoiding a hydration mismatch.
function usePrefersCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia('(pointer: coarse)');
    setCoarse(mql.matches);
    function handleChange(e: MediaQueryListEvent) {
      setCoarse(e.matches);
    }
    mql.addEventListener('change', handleChange);
    return () => mql.removeEventListener('change', handleChange);
  }, []);

  return coarse;
}

/**
 * useLongPress — touch-and-hold gesture with the full suppression recipe a
 * long-press needs to behave, not just a bare timer.
 *
 * A naive `setTimeout` started on `pointerdown` and cleared on `pointermove`
 * fails in three specific ways this hook exists to fix:
 *  1. Any movement at all cancels it — but a real finger jitters a few px even
 *     on a "still" hold, so the gesture misfires constantly. `moveTolerance`
 *     requires deliberate movement before cancelling.
 *  2. `pointercancel` (the browser converting the touch into a scroll) isn't
 *     handled — the timer survives and fires mid-scroll. Handled here.
 *  3. Nothing suppresses the OS's own reaction to a long touch-hold: iOS shows
 *     its link-preview callout, Android starts text selection or opens a
 *     context menu, and either can fire *alongside* the gesture this hook
 *     triggers. `onContextMenu` + the returned `style` (touch-callout,
 *     user-select, touch-action) close all three, gated to coarse-pointer
 *     devices only — unconditionally disabling `user-select` would break
 *     mouse text selection on desktop, which never held this long-press to
 *     begin with (see `onPointerDown`'s own `pointerType` check).
 *
 * The click that may or may not follow a fired long-press (iOS often sends
 * none at all) is swallowed for `suppressClickMs`, not indefinitely — an
 * unbounded suppression flag left armed by a browser that never sends that
 * click silently eats the user's *next* unrelated tap on the same element.
 */
export function useLongPress({
  onLongPress,
  delay = DEFAULT_DELAY_MS,
  moveTolerance = DEFAULT_MOVE_TOLERANCE_PX,
  suppressClickMs = DEFAULT_SUPPRESS_CLICK_MS,
  vibrate = true,
  disabled = false,
}: UseLongPressOptions): LongPressHandlers {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const suppressUntilRef = useRef(0);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // A press pending when the component unmounts (its target left the view
  // mid-hold — e.g. the row it's on was deleted by a sync elsewhere) must not
  // fire onLongPress against state that's no longer there.
  useEffect(() => clearTimer, [clearTimer]);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      if (disabled || e.pointerType !== 'touch') return;
      startRef.current = { x: e.clientX, y: e.clientY };
      clearTimer();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        suppressUntilRef.current = Date.now() + suppressClickMs;
        if (vibrate && typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate(10);
        }
        onLongPress();
      }, delay);
    },
    [disabled, delay, suppressClickMs, vibrate, onLongPress, clearTimer],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent) => {
      const start = startRef.current;
      if (!start || !timerRef.current) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (Math.hypot(dx, dy) > moveTolerance) clearTimer();
    },
    [moveTolerance, clearTimer],
  );

  const cancelPress = useCallback(() => {
    clearTimer();
    startRef.current = null;
  }, [clearTimer]);

  // Preempts the OS's own long-press menu (Android's link/image context menu)
  // whenever our gesture is pending or has just fired — either way, this
  // hook's action is the one that should win, not a native menu appearing on
  // top of (or instead of) it. iOS's equivalent (the touch-callout link
  // preview) isn't a JS event at all — that one is closed by `style` below.
  const onContextMenu = useCallback((e: ReactMouseEvent) => {
    if (timerRef.current || Date.now() < suppressUntilRef.current) e.preventDefault();
  }, []);

  const onClick = useCallback((e: ReactMouseEvent) => {
    if (Date.now() < suppressUntilRef.current) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, []);

  const isCoarsePointer = usePrefersCoarsePointer();
  const style: CSSProperties = isCoarsePointer
    ? {
        WebkitTouchCallout: 'none',
        WebkitUserSelect: 'none',
        userSelect: 'none',
        touchAction: 'manipulation',
      }
    : {};

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: cancelPress,
    onPointerCancel: cancelPress,
    onPointerLeave: cancelPress,
    onContextMenu,
    onClick,
    style,
  };
}
