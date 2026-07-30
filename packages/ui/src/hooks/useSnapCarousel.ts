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

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    function handleScroll() {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
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
    return () => {
      el.removeEventListener('scroll', handleScroll);
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
