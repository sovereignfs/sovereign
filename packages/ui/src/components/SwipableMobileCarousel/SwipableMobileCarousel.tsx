'use client';

import {
  Children,
  isValidElement,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactElement,
  type ReactNode,
} from 'react';
import { useSnapCarousel } from '../../hooks/useSnapCarousel';
import { SwipableMobileCarouselDots } from '../SwipableMobileCarouselDots/SwipableMobileCarouselDots';
import { SwipableMobileCarouselSlide } from './SwipableMobileCarouselSlide';
import { CarouselSlideMountContext } from './context';
import styles from './SwipableMobileCarousel.module.css';

export interface SwipableMobileCarouselIndicatorProps {
  count: number;
  activeIndex: number;
  labels: (string | undefined)[];
  onJump: (index: number) => void;
}

export interface SwipableMobileCarouselProps {
  /** Controlled active slide index — the caller owns this (typically via
   *  useCarouselRouteSync, or plain useState). */
  activeIndex: number;
  /** Called when a swipe gesture settles on a different index, or when the
   *  reorder-jump fix re-snaps after the active slide's position changes.
   *  The caller is responsible for updating `activeIndex` in response. */
  onSettle: (index: number) => void;
  /** How many slides on each side of the active one stay mounted. Default 1
   *  matches both sovereign-tasks' and sovereign-shopper's existing "swipe
   *  never shows a spinner" behavior. Slides outside this window keep their
   *  DOM slot (so scroll-snap's position-based indexing stays correct) but
   *  their children are not mounted at all. */
  prefetchDistance?: number;
  /** Passed straight through to the internal useSnapCarousel. */
  settleDebounceMs?: number;
  /** Required — labels the scroller region for assistive tech. No generic
   *  fallback, since one would be wrong for every actual consumer. */
  'aria-label': string;
  /** Renders the indicator. Defaults to SwipableMobileCarouselDots. Pass
   *  `null` to render no indicator at all. */
  renderIndicator?: null | ((props: SwipableMobileCarouselIndicatorProps) => ReactNode);
  className?: string;
  /** Must be SwipableMobileCarouselSlide elements (nullish/boolean children
   *  are safely skipped for conditional slides). A dev-mode warning is
   *  logged for any other child type — see resolveSlides below. */
  children: ReactNode;
}

interface ResolvedSlide {
  key: string;
  label: string | undefined;
  element: ReactElement;
}

function describeChild(child: unknown): string {
  if (isValidElement(child)) {
    const type = child.type;
    if (typeof type === 'string') return `<${type}>`;
    if (typeof type === 'function') {
      const named = type as { displayName?: string; name?: string };
      return `<${named.displayName ?? named.name ?? 'Component'}>`;
    }
    return '<unknown>';
  }
  if (typeof child === 'string') return `string "${child}"`;
  return String(child);
}

function resolveSlides(children: ReactNode): ResolvedSlide[] {
  const slides: ResolvedSlide[] = [];
  Children.forEach(children, (child, index) => {
    if (child === null || child === undefined || child === false || child === true) return;
    if (!isValidElement(child) || child.type !== SwipableMobileCarouselSlide) {
      if (process.env.NODE_ENV !== 'production') {
        console.error(
          '[SwipableMobileCarousel] Every child must be a <SwipableMobileCarouselSlide>. ' +
            `Found ${describeChild(child)} at position ${index}. A non-Slide child shifts every ` +
            "subsequent slide's index, desyncing scroll-snap position from activeIndex.",
        );
      }
      return;
    }
    const slideProps = child.props as { slideKey: string; label?: string };
    if (process.env.NODE_ENV !== 'production' && !slideProps.label) {
      console.warn(
        `[SwipableMobileCarousel] SwipableMobileCarouselSlide "${slideProps.slideKey}" has no ` +
          'label — it will show as "Slide N of count" in the default dots indicator.',
      );
    }
    slides.push({ key: slideProps.slideKey, label: slideProps.label, element: child });
  });
  return slides;
}

/**
 * SwipableMobileCarousel — a compound component for swiping between full-
 * width slides (each an independent route/view on mobile), wrapping
 * useSnapCarousel. This library's first compound component: every other
 * component here is flat/prop-based, but slide content is large, arbitrary,
 * per-plugin subtrees that need a header-known/body-loading split an
 * array-of-objects prop would only express with worse JSX ergonomics.
 *
 * Owns rendering and mount-window mechanics only — it has no opinion on
 * where slide data lives. Do NOT: (a) aggregate cross-slide data inside a
 * SwipableMobileCarouselSlideBody (that recomputes on every slide render
 * regardless of which slide is active — belongs in the parent, which
 * already knows every slide exists); (b) mount a detail overlay (Sheet,
 * Dialog) inside a Slide's children — mount it as a sibling of
 * SwipableMobileCarousel instead, controlled by the same state that would
 * otherwise drive a routed page's overlay. sovereign-tasks' current
 * hand-rolled carousel does both and is measurably laggier than
 * sovereign-shopper's equivalent, which keeps its overlay in the routed pane.
 */
export function SwipableMobileCarousel({
  activeIndex,
  onSettle,
  prefetchDistance = 1,
  settleDebounceMs = 120,
  'aria-label': ariaLabel,
  renderIndicator,
  className,
  children,
}: SwipableMobileCarouselProps) {
  const slides = useMemo(() => resolveSlides(children), [children]);
  const count = slides.length;
  const clampedActiveIndex = count === 0 ? 0 : Math.max(0, Math.min(count - 1, activeIndex));

  const { scrollRef, scrollToIndex } = useSnapCarousel({
    itemCount: count,
    onSettle,
    debounceMs: settleDebounceMs,
  });

  // Initial scroll position, once — subsequent activeIndex changes come
  // either from the user's own swipe (already reflected in DOM scroll
  // position; re-syncing to the same index below is a harmless no-op) or an
  // external navigation, which the effect below scrolls to explicitly.
  const initialActiveIndexRef = useRef(clampedActiveIndex);
  useLayoutEffect(() => {
    scrollToIndex(initialActiveIndexRef.current, 'instant');
    // Runs once on mount only, matching both existing plugins' identical pattern.
  }, []);

  const didMountActiveIndexSyncRef = useRef(false);
  useEffect(() => {
    if (!didMountActiveIndexSyncRef.current) {
      didMountActiveIndexSyncRef.current = true;
      return;
    }
    scrollToIndex(clampedActiveIndex, 'smooth');
  }, [clampedActiveIndex, scrollToIndex]);

  // Reorder-jump fix: scroll-snap position tracks DOM order, not slide
  // identity. If the previously-active slide's key still exists but moved
  // (a caller re-sorted their slide array while mounted), re-snap to its
  // new position and report it via onSettle so the caller's activeIndex
  // stays in sync — otherwise scroll position silently desyncs from slide
  // identity. Runs every commit (no dependency array) since it needs to
  // notice any children change, not just a specific prop.
  const prevKeysRef = useRef<string[] | null>(null);
  useLayoutEffect(() => {
    const currentKeys = slides.map((s) => s.key);
    const prevKeys = prevKeysRef.current;
    if (prevKeys) {
      const sameOrder =
        prevKeys.length === currentKeys.length && prevKeys.every((k, i) => k === currentKeys[i]);
      if (!sameOrder) {
        const activeKey = prevKeys[clampedActiveIndex];
        if (activeKey !== undefined) {
          const newIndex = currentKeys.indexOf(activeKey);
          if (newIndex !== -1 && newIndex !== clampedActiveIndex) {
            scrollToIndex(newIndex, 'instant');
            onSettle(newIndex);
          }
        }
      }
    }
    prevKeysRef.current = currentKeys;
  });

  function handleJump(index: number) {
    // scrollToIndex sets useSnapCarousel's own dedupe ref synchronously, so
    // the natural scroll-settle detection will NOT re-report this index —
    // onSettle must be called directly here, same pairing as the
    // reorder-jump fix above.
    scrollToIndex(index, 'smooth');
    onSettle(index);
  }

  const labels = slides.map((s) => s.label);
  const indicator =
    renderIndicator === null ? null : renderIndicator ? (
      renderIndicator({ count, activeIndex: clampedActiveIndex, labels, onJump: handleJump })
    ) : (
      <SwipableMobileCarouselDots
        className={styles.dots}
        count={count}
        activeIndex={clampedActiveIndex}
        labels={labels}
        aria-label={ariaLabel}
        onJump={handleJump}
      />
    );

  return (
    <div className={[styles.wrap, className].filter(Boolean).join(' ')}>
      <div className={styles.scroller} ref={scrollRef} role="region" aria-label={ariaLabel}>
        {slides.map((slide, i) => (
          <div className={styles.slide} key={slide.key}>
            <CarouselSlideMountContext.Provider
              value={{ isMounted: Math.abs(i - clampedActiveIndex) <= prefetchDistance }}
            >
              {slide.element}
            </CarouselSlideMountContext.Provider>
          </div>
        ))}
      </div>
      {indicator}
    </div>
  );
}
