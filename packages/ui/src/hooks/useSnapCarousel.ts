'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
  /** The index to seed `liveIndex` with before any scroll event has fired —
   *  must match whatever the caller initially scrolls/renders to (typically
   *  the same value used for `SwipableMobileCarousel`'s `activeIndex`).
   *  Without this, `liveIndex` would start at 0 regardless of where the
   *  carousel actually opens (e.g. a deep link straight to slide 8),
   *  briefly unmounting every slide except the first few until the first
   *  scroll event arrives to correct it. */
  initialIndex?: number;
}

export interface UseSnapCarouselResult {
  /** Attach to the `scroll-snap-type: x` scroll container. */
  scrollRef: RefObject<HTMLDivElement | null>;
  /** Imperatively scrolls the container to a slide index. */
  scrollToIndex: (index: number, behavior?: ScrollBehavior) => void;
  /** The slide index nearest the container's *current* scroll position,
   *  updated synchronously on every `scroll` event — not debounced, and not
   *  the same thing as the last-reported `onSettle` index. See its own
   *  assignment below for why a consumer needs both. */
  liveIndex: number;
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
  initialIndex = 0,
}: UseSnapCarouselOptions): UseSnapCarouselResult {
  const scrollRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastIndexRef = useRef<number | null>(null);
  // Real-time (synchronous, not debounced) read of "which slide is the
  // container's scroll position nearest right now." A fast flick can carry
  // native scroll-snap momentum straight past an intermediate slide to one
  // two or more away in a single continuous gesture — the settle-detection
  // above deliberately still waits out the full debounce window before
  // reporting that via onSettle (so it can tell a real settle from drift,
  // see chainTrustedRef's own comment). But `SwipableMobileCarousel`'s mount
  // window is keyed off the *settled* index, so during that debounce window
  // the slide the container had already scrolled to — visually, right now —
  // was never in the mount window and had never been rendered at all: a
  // real, reproduced-on-video gap where the carousel shows nothing (not even
  // a loading skeleton) for the length of one full debounce cycle after a
  // multi-slide flick. `liveIndex` exists so the mount window can track
  // wherever the container currently visually is, independent of whether
  // that position has been confirmed as a real settle yet.
  const [liveIndex, setLiveIndex] = useState(initialIndex);
  // Kept in a ref so the scroll listener always calls the latest callback
  // without needing to be torn down and re-attached on every render.
  const onSettleRef = useRef(onSettle);
  onSettleRef.current = onSettle;
  // Timestamp (Date.now()) of the most recent real input (touch, wheel/
  // trackpad, or a mouse drag) — see the doc comment above `noteGesture`
  // below for why settle-detection is gated on this instead of firing for
  // any `scroll` event.
  const lastGestureAtRef = useRef(0);
  // Whether the *current* run of scroll events (since the last time the
  // container went quiet for debounceMs) was kicked off by real input. Set
  // at the start of each run by checking lastGestureAtRef, then held for the
  // whole run regardless of how long it continues — see `handleScroll`'s own
  // comment for why this can't just be "was there a gesture event within the
  // last debounceMs" re-checked at settle time: native momentum/snap-
  // correction after a real swipe can keep producing scroll events for
  // longer than any fixed slack window without a single further touch event,
  // and a first version of this fix that compared elapsed time against a
  // fixed `debounceMs * 2` slack dropped exactly those settles — silently
  // leaving activeIndex stuck on the old slide while the container had
  // already visually scrolled to the new one, which is worse than the bug
  // being fixed (the mount window then unmounts whatever's actually on
  // screen, since it's keyed off the now-stale index — a blank, un-
  // recoverable-without-reload carousel). `noteGesture` can also upgrade
  // trust mid-run, for a real gesture that starts while an untrusted run's
  // debounce timer is still pending.
  const chainTrustedRef = useRef(false);

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
      // Upgrades the currently in-flight run too, not just the next one —
      // covers a real gesture starting while an untrusted run's debounce
      // timer (started by an earlier, unrelated drift scroll event) is
      // still pending.
      chainTrustedRef.current = true;
    }
    function handlePointerMove(event: PointerEvent) {
      // Ignore hover — only a held button (mouse drag) counts as input.
      if (event.buttons) noteGesture();
    }
    function updateLiveIndexNow() {
      const current = scrollRef.current;
      if (!current) return;
      const width = current.clientWidth;
      if (!width) return;
      const idx = Math.max(0, Math.min(itemCount - 1, Math.round(current.scrollLeft / width)));
      // Bails out (same reference, no re-render) when the index hasn't
      // actually changed — a scroll container fires many `scroll` events
      // while passing through the same slide's territory, not just at its
      // boundaries. Synchronous rather than rAF-throttled: jsdom (this
      // hook's own test environment) doesn't reliably run
      // requestAnimationFrame callbacks under fake timers, and browsers
      // already coalesce native scroll events to roughly once per frame on
      // their own, so a second throttle here bought nothing but test
      // fragility.
      setLiveIndex((prev) => (prev === idx ? prev : idx));
    }
    function handleScroll() {
      updateLiveIndexNow();
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      } else {
        // No debounce timer pending means the container had been fully
        // quiet — this scroll event starts a new run. Trust it only if real
        // input happened recently; once granted, trust holds for the whole
        // run (see chainTrustedRef's own doc comment above) no matter how
        // long momentum/snap-correction keeps producing scroll events after
        // this point with no further input.
        chainTrustedRef.current = Date.now() - lastGestureAtRef.current <= debounceMs;
      }
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        const trusted = chainTrustedRef.current;
        chainTrustedRef.current = false;
        if (!trusted) return;
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

  // Memoized so its reference stays stable across renders — SwipableMobile
  // Carousel depends on it in a useEffect deps array alongside
  // clampedActiveIndex, and an unmemoized function recreated on every
  // render (e.g. every time liveIndex itself changes below) would make that
  // effect re-fire on every scroll, calling scrollToIndex again and — since
  // it also resets liveIndex to whatever index it was told to scroll to —
  // immediately stomping the very liveIndex update that triggered the
  // re-render in the first place. Caught by this hook's own test suite
  // (a live-index test that failed until this was memoized), not just
  // reasoned about — worth keeping as a regression guard, not just a
  // performance nicety.
  const scrollToIndex = useCallback((index: number, behavior: ScrollBehavior = 'smooth') => {
    const el = scrollRef.current;
    if (!el) return;
    lastIndexRef.current = index;
    // Belt-and-suspenders: a real scrollTo() also fires its own 'scroll'
    // event, which updates liveIndex synchronously too — but jsdom's mocked
    // scrollTo (this hook's own test environment) doesn't, and the initial
    // mount scroll / reorder-jump fix both need the target slide mounted
    // immediately regardless.
    setLiveIndex(index);
    el.scrollTo({ left: index * el.clientWidth, behavior });
  }, []);

  return { scrollRef, scrollToIndex, liveIndex };
}
