import type { ReactNode } from 'react';
import styles from './SwipableMobileCarouselSlideParts.module.css';

export interface SwipableMobileCarouselSlideBodyProps {
  children: ReactNode;
  /** While true, renders `loadingFallback` INSTEAD OF children — scoped to
   *  just this region, not the whole slide. This is what fixes the
   *  "whole slide blanks out, title included, until its own fetch resolves"
   *  bug: a caller renders `<SwipableMobileCarouselSlideHeader>` from
   *  already-known metadata unconditionally, and gates only this component's
   *  `loading` on the slower fetch — the natural way to compose
   *  Header/Body/Footer as siblings already produces that behavior, instead
   *  of gating the entire slide behind one boolean. */
  loading?: boolean;
  loadingFallback?: ReactNode;
  className?: string;
}

const defaultLoadingFallback = <div className={styles.loading}>Loading…</div>;

/**
 * SwipableMobileCarouselSlideBody — the scrollable region of a slide.
 *
 * Deliberately does not set `touch-action: pan-y` on its scroll container
 * (see SwipableMobileCarouselSlideParts.module.css's `.body` rule) — that
 * would intersect-to-empty against the carousel's own horizontal
 * touch-action handling (docs/architecture-rules.md's touch-action
 * intersection rule), breaking both the vertical scroll here and the
 * horizontal swipe between slides.
 */
export function SwipableMobileCarouselSlideBody({
  children,
  loading = false,
  loadingFallback,
  className,
}: SwipableMobileCarouselSlideBodyProps) {
  return (
    <div className={[styles.body, className].filter(Boolean).join(' ')}>
      {loading ? (loadingFallback ?? defaultLoadingFallback) : children}
    </div>
  );
}
