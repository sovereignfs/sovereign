'use client';

import { useContext, type ReactNode } from 'react';
import { CarouselSlideMountContext } from './context';

export interface SwipableMobileCarouselSlideProps {
  /** Stable identity for this slide, independent of its position among
   *  siblings — required. This is what makes SwipableMobileCarousel's
   *  reorder-jump fix possible: a plain array index can't distinguish "this
   *  slide moved to position 2" from "this slide was removed and a
   *  different one is now at position 2." Reuse whatever id the caller
   *  already keys their `.map()` on (e.g. a list's own id). */
  slideKey: string;
  /** Accessible label surfaced to the default dots indicator (e.g.
   *  "Groceries"). Falls back to "Slide N of count" if omitted — omitting it
   *  logs a dev-mode warning, since every real slide usually has a title
   *  available synchronously already. */
  label?: string;
  /** SwipableMobileCarouselSlideHeader/Body/Footer, in any order/subset. */
  children: ReactNode;
}

/**
 * SwipableMobileCarouselSlide — a single slide of a SwipableMobileCarousel.
 * Renders its children only while within the carousel's mount window (the
 * active slide ± its configured prefetchDistance); outside that window it
 * renders nothing, matching both sovereign-tasks and sovereign-shopper's
 * existing "never fetch/render a non-neighbor slide" behavior, now
 * centralized instead of hand-rolled per plugin.
 */
export function SwipableMobileCarouselSlide({ children }: SwipableMobileCarouselSlideProps) {
  const ctx = useContext(CarouselSlideMountContext);
  if (!ctx?.isMounted) return null;
  return <>{children}</>;
}
