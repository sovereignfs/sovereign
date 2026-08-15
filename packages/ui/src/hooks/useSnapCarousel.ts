'use client';

import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

export interface UseSnapCarouselOptions {
  /** Total number of slides — settle detection clamps to this range. */
  itemCount: number;
  /** Called when the user's scroll gesture settles on a different slide
   *  index than the last one reported. */
  onSettle?: (index: number) => void;
  /** Debounce delay (ms) after the last `scroll` event before checking where
   *  the container settled. Default 120 — matches the value this hook was
   *  extracted from. Debounced rather than keyed to the `scrollend` event,
   *  which pre-17.4 iOS Safari/WKWebView doesn't support. */
  debounceMs?: number;
}

export interface UseSnapCarouselResult {
  /** Attach to the `scroll-snap-type: x` scroll container. */
  scrollRef: RefObject<HTMLDivElement | null>;
  /** Imperatively scrolls the container to a slide index. */
  scrollToIndex: (index: number, behavior?: ScrollBehavior) => void;
}

/**
 * useSnapCarousel — debounced "settled slide" detection over a native
 * `scroll-snap-type: x` container, extracted from `sovereign-tasks`'s
 * `MobileTasksCarousel` and independently reimplemented in
 * `sovereign-shopper`'s `MobileShopperCarousel` (RFC 0079, epic task 9.20).
 * Gives swipe-between-slides physics for free via native scroll-snap, with
 * this hook only handling "which slide did we land on."
 */
export function useSnapCarousel({
  itemCount,
  onSettle,
  debounceMs = 120,
}: UseSnapCarouselOptions): UseSnapCarouselResult {
  const scrollRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastIndexRef = useRef<number | null>(null);
  // Kept in a ref so the scroll listener always calls the latest callback
  // without needing to be torn down and re-attached on every render.
  const onSettleRef = useRef(onSettle);
  onSettleRef.current = onSettle;
  // Timestamp (Date.now()) of the most recent real input (touch, wheel/
  // trackpad, or a mouse drag) — see the doc comment above `noteGesture`
  // below for why settle-detection is gated on this instead of firing for
  // any `scroll` event. Compared by elapsed time at settle-check time
  // rather than via a second parallel timer: two independently-scheduled
  // timers with the same delay racing to fire first is exactly the kind of
  // ordering-dependent bug this fix exists to eliminate, not something to
  // introduce a second copy of.
  const lastGestureAtRef = useRef(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // A `scroll-snap-type: mandatory` container has no legitimate reason to
    // move on its own — every real position change is either (a) driven by
    // the finger/wheel/mouse still in contact, (b) the browser's own
    // momentum/snap-correction settling immediately after release, or (c)
    // our own scrollToIndex() call, which already updates lastIndexRef
    // synchronously so settle-detection for it is a no-op regardless. A
    // `scroll` event that arrives with none of the above recently active is
    // drift, not a settle — most commonly a slide's own content changing
    // size while it's still loading, which can nudge scrollLeft by a
    // fraction of a slide width. Previously any such event that happened to
    // round to a different index than the currently active one was treated
    // as a genuine settle, silently "auto-swiping" the carousel back to
    // whatever slide that rounding landed on — reproduced live via a user
    // screen recording (swiping forward to a still-loading slide, then the
    // carousel snapping back to the previous one ~150ms later with no
    // further touch input) and confirmed via a unit test showing a second,
    // unrelated `scroll` event alone was enough to trigger a second,
    // contradicting `onSettle` call.
    function noteGesture() {
      lastGestureAtRef.current = Date.now();
    }
    function handlePointerMove(event: PointerEvent) {
      // Ignore hover — only a held button (mouse drag) counts as input.
      if (event.buttons) noteGesture();
    }
    function handleScroll() {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        // Allow a little slack beyond debounceMs for the browser's own
        // momentum/snap-correction to keep settling shortly after the last
        // touchend/gesture event, without requiring touchmove to have kept
        // firing right up to the moment the container actually stops.
        if (Date.now() - lastGestureAtRef.current > debounceMs * 2) return;
        const current = scrollRef.current;
        if (!current) return;
        const width = current.clientWidth;
        if (!width) return;
        const rawIndex = Math.round(current.scrollLeft / width);
        const newIndex = Math.max(0, Math.min(itemCount - 1, rawIndex));
        if (newIndex === lastIndexRef.current) return;
        lastIndexRef.current = newIndex;
        onSettleRef.current?.(newIndex);
      }, debounceMs);
    }
    el.addEventListener('scroll', handleScroll, { passive: true });
    el.addEventListener('touchstart', noteGesture, { passive: true });
    el.addEventListener('touchmove', noteGesture, { passive: true });
    el.addEventListener('wheel', noteGesture, { passive: true });
    el.addEventListener('pointerdown', noteGesture);
    el.addEventListener('pointermove', handlePointerMove);
    return () => {
      el.removeEventListener('scroll', handleScroll);
      el.removeEventListener('touchstart', noteGesture);
      el.removeEventListener('touchmove', noteGesture);
      el.removeEventListener('wheel', noteGesture);
      el.removeEventListener('pointerdown', noteGesture);
      el.removeEventListener('pointermove', handlePointerMove);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [itemCount, debounceMs]);

  function scrollToIndex(index: number, behavior: ScrollBehavior = 'smooth') {
    const el = scrollRef.current;
    if (!el) return;
    lastIndexRef.current = index;
    el.scrollTo({ left: index * el.clientWidth, behavior });
  }

  return { scrollRef, scrollToIndex };
}
