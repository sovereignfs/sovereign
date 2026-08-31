import type { ReactNode } from 'react';

export interface SwipeStackCardProps {
  /** Stable identity for this card, independent of its position among
   *  siblings — required. This is what SwipeStack reads (via child.props,
   *  not React's own `key`, which a component can't see on itself) to know
   *  which card is on top and what id to report through onSwipe. Reuse
   *  whatever id the caller already keys their `.map()` on. */
  cardId: string;
  children: ReactNode;
}

/**
 * SwipeStackCard — a single card of a SwipeStack. Unlike
 * SwipableMobileCarouselSlide, this has no mount-window logic of its own:
 * SwipeStack only ever renders the top two cards' elements at all (there is
 * no scroll-position reason to keep every sibling in the DOM the way the
 * carousel's scroll-snap track does), so there is nothing here to gate.
 */
export function SwipeStackCard({ children }: SwipeStackCardProps) {
  return <>{children}</>;
}
