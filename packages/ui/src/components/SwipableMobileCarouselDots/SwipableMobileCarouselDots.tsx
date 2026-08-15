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
  /** `'compact'` halves the gap between dots (`--sv-space-2` → `--sv-space-1`)
   *  — for a carousel with enough slides that the default spacing reads as
   *  long/cramped on a narrow viewport (e.g. a many-list mobile app). Leaves
   *  each dot's own 20px hit target untouched; only the gap changes. Defaults
   *  to `'default'` — every existing consumer's spacing is unaffected unless
   *  it opts in. */
  density?: 'default' | 'compact';
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
  density = 'default',
  className,
}: SwipableMobileCarouselDotsProps) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={[styles.dots, density === 'compact' ? styles.dotsCompact : '', className]
        .filter(Boolean)
        .join(' ')}
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
