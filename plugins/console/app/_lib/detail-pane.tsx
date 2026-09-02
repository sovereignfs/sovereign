'use client';

import { createContext, useContext, useEffect, type ReactNode } from 'react';

interface DetailPaneEntry {
  node: ReactNode;
  /** See `useConsoleDetailPane`'s doc comment for why this can't just be a
   * `key` prop on `node` itself. */
  detailKey: string;
}

// undefined (the default, outside any Provider) means "no ConsoleLayout
// ancestor" — distinct from a real setter function, so
// useConsoleDetailPane can silently no-op instead of throwing. Mirrors
// `@sovereignfs/ui`'s `Dialog`/`useOverlaySecondRow` OverlaySecondRowContext
// pattern exactly.
const ConsoleDetailPaneContext = createContext<
  ((entry: DetailPaneEntry | null) => void) | undefined
>(undefined);

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
 *
 * `detailKey` (e.g. the selected row's id) is required, separate from
 * `node`, and MUST NOT be replaced with a `key` prop set directly on the
 * element passed as `node`. Found live: a `key={selectedGroup.id}` set on
 * `GroupDetailPane` in `groups/page.tsx` (mirrored on `UserDetailPane` in
 * `users/page.tsx`) looked correct and was believed to force a remount on
 * every selection change, but silently never did — switching from one
 * group to another left `GroupDetailFields`' uncontrolled
 * `defaultValue={group.name}` inputs frozen on the first-selected group,
 * while the header/id/members (prop- and effect-driven, not
 * `defaultValue`-seeded) updated correctly, which is what actually
 * surfaced the gap. Root cause: `node` here is produced by a Server
 * Component (`GroupsPage`) and crosses into this Client Component as a
 * `children`/prop value, not as a direct sibling in the same JSX
 * expression — Next.js's RSC (Flight) protocol hands it across that
 * boundary as an opaque not-yet-resolved reference object
 * (`$$typeof`/`_payload`/`_init`), not a plain React element. That
 * wrapper has no `.key` of its own — the key lives on the *inner* element
 * it will eventually resolve to — so by the time this value reaches
 * `ConsoleLayout` and gets rendered inside `ThreeColumnLayout`
 * (`Children.toArray`, then a plain `{child}` position), React's own
 * reconciliation reads `.key` off the wrapper, finds none, and falls back
 * to a stable positional key — so it never sees a change and just updates
 * the existing fiber in place instead of unmounting/remounting it.
 * `detailKey` sidesteps this entirely: it's a plain string, passed through
 * ordinary props/context/state (no element-identity games), and
 * `ConsoleLayout` applies it as a `key` on a `Fragment` it creates itself,
 * entirely client-side — a key set by the same component that renders the
 * keyed position always works, RSC-crossed content inside it included.
 */
export function useConsoleDetailPane(node: ReactNode | null, detailKey: string | null): void {
  const setDetailPane = useContext(ConsoleDetailPaneContext);
  useEffect(() => {
    if (!setDetailPane) return;
    setDetailPane(node !== null && detailKey !== null ? { node, detailKey } : null);
    return () => setDetailPane(null);
  }, [setDetailPane, node, detailKey]);
}
