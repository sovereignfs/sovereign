'use client';

import { createContext } from 'react';

export interface CarouselSlideMountContextValue {
  /** Whether this slide is within the carousel's mount window (the active
   *  slide ± its configured prefetchDistance). Kept out of the main .tsx
   *  file for React Fast Refresh hygiene (a file exporting only components
   *  refreshes more reliably than one mixing components and plain values). */
  isMounted: boolean;
}

export const CarouselSlideMountContext = createContext<CarouselSlideMountContextValue | null>(null);
