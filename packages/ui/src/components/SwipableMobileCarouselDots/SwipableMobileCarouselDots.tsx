'use client';

import styles from './SwipableMobileCarouselDots.module.css';

export interface SwipableMobileCarouselDotsProps {
  count: number;
  activeIndex: number;
  onJump: (index: number) => void;
  /** Per-dot accessible names, e.g. ["Lists", "Starred", "Groceries"]. Falls
   *  back to "Slide N of count" for any index without one. */
  labels?: (string | undefined)[];
  /** Labels the whole group — required, no generic fallback (mirrors
   *  SwipableMobileCarousel's own required aria-label). */
  'aria-label': string;
  className?: string;
}

/**
 * SwipableMobileCarouselDots — a real, tappable, labeled slide indicator.
 * Standalone (not carousel-only): reusable anywhere a set of positions needs
 * a dot indicator (e.g. an image gallery, an onboarding stepper), and is also
 * SwipableMobileCarousel's default `renderIndicator`.
 *
 * Replaces the `aria-hidden`, non-interactive dots pattern both
 * sovereign-tasks and sovereign-shopper currently hand-roll — every dot here
 * is a real `role="tab"` button with its own accessible name, reachable by
 * keyboard. No roving tabIndex/arrow-key handling: `Tabs` (this library's
 * other `role="tablist"` component) has none either, so this stays
 * consistent with it rather than gold-plating past its sibling.
 */
export function SwipableMobileCarouselDots({
  count,
  activeIndex,
  onJump,
  labels,
  'aria-label': ariaLabel,
  className,
}: SwipableMobileCarouselDotsProps) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={[styles.dots, className].filter(Boolean).join(' ')}
    >
      {Array.from({ length: count }, (_, i) => {
        const active = i === activeIndex;
        const label = labels?.[i] ?? `Slide ${i + 1} of ${count}`;
        return (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={label}
            className={[styles.dot, active ? styles.dotActive : ''].filter(Boolean).join(' ')}
            onClick={() => onJump(i)}
          />
        );
      })}
    </div>
  );
}
