'use client';

import { useRef } from 'react';

// Real double-clicks (desktop mouse) report e.detail === 2 natively — no extra
// work needed there. Touch-generated click events always report detail === 1
// (no browser synthesizes a dblclick-style count from two taps), so
// double-tap has to be detected by timing two clicks against each other
// instead. Sharing one implementation for both means every double-click-style
// affordance behaves the same way on mouse and touch without the caller
// duplicating the two code paths.
const DOUBLE_TAP_MS = 350;

/**
 * useDoubleTapHandler — fires `onDoubleTap` on a real double-click (desktop)
 * or two taps within `DOUBLE_TAP_MS` (touch).
 *
 * Only safe when the *single* tap/click has no default action of its own to
 * preempt — e.g. a colour swatch with nothing to cancel. If the single tap
 * navigates, opens something, or otherwise does something a following double
 * needs to be able to undo before it happens, use `useSingleOrDoubleTap`
 * instead: this hook fires `onDoubleTap` only, leaving any single-tap handling
 * to the caller's own `onClick`, which already ran immediately and can't be
 * un-done here.
 *
 * The event is passed through to `onDoubleTap` rather than calling
 * `preventDefault` internally — not every call site needs to cancel
 * something, so the decision is left to the caller.
 */
export function useDoubleTapHandler<E extends { detail: number }>(
  onDoubleTap: (e: E) => void,
): (e: E) => void {
  const lastTime = useRef(0);
  return (e: E) => {
    if (e.detail === 2) {
      onDoubleTap(e);
      return;
    }
    const now = Date.now();
    if (now - lastTime.current < DOUBLE_TAP_MS) {
      lastTime.current = 0;
      onDoubleTap(e);
    } else {
      lastTime.current = now;
    }
  };
}

/**
 * useSingleOrDoubleTap — for call sites where the single tap/click *does*
 * have a default action (e.g. navigating) that a following double-tap must be
 * able to preempt.
 *
 * A real double-click gets away with firing the single action immediately and
 * only detecting the double afterward, because `e.detail === 2` is the
 * browser's own resolved signal, arriving on the very click that matters. A
 * touch double-tap has no equivalent "hold on, there might be a second one"
 * signal — the only way to know is to wait out the window before committing
 * to the single action, which is what this hook does: `onSingle` is deferred
 * by `DOUBLE_TAP_MS` and only actually runs if no second tap arrives in that
 * time. This means every single tap through this hook incurs that latency —
 * only use it where a genuine double-tap gesture must be able to preempt the
 * single action; `useDoubleTapHandler` above has no such delay.
 */
export function useSingleOrDoubleTap<E extends { detail: number }>(
  onSingle: (e: E) => void,
  onDouble: (e: E) => void,
): (e: E) => void {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  return (e: E) => {
    if (e.detail === 2) {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      onDouble(e);
      return;
    }
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
      onDouble(e);
      return;
    }
    timer.current = setTimeout(() => {
      timer.current = null;
      onSingle(e);
    }, DOUBLE_TAP_MS);
  };
}
