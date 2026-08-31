'use client';

import { createContext, useContext, useEffect, type ReactNode } from 'react';

// undefined (the default, outside any Provider) means "no ConsoleLayout
// ancestor" — distinct from a real setter function, so
// useConsoleDetailPane can silently no-op instead of throwing. Mirrors
// `@sovereignfs/ui`'s `Dialog`/`useOverlaySecondRow` OverlaySecondRowContext
// pattern exactly.
const ConsoleDetailPaneContext = createContext<((node: ReactNode | null) => void) | undefined>(
  undefined,
);

export const ConsoleDetailPaneProvider = ConsoleDetailPaneContext.Provider;

/**
 * Lets a page several levels below `ConsoleLayout` (e.g.
 * `/console/users/page.tsx`) supply the `ThreeColumnLayout`'s 3rd
 * ("detail") column — the layout owns the column, the page owns what's in
 * it. Registers on mount/change, clears on unmount, so navigating to a
 * route with no selection (or away from `/console/users` entirely) drops
 * the detail column automatically. Prefer `ConsoleDetailSlot` at call
 * sites — it wraps this so a Server Component page doesn't need its own
 * `'use client'` directive just to register detail content.
 */
export function useConsoleDetailPane(node: ReactNode | null): void {
  const setDetailPane = useContext(ConsoleDetailPaneContext);
  useEffect(() => {
    if (!setDetailPane) return;
    setDetailPane(node);
    return () => setDetailPane(null);
  }, [setDetailPane, node]);
}
