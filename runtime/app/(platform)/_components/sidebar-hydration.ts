import { useEffect, useState } from 'react';

export interface SidebarPluginEntry {
  id: string;
  name: string;
  routePrefix: string;
  iconUrl?: string;
  hasMonetization: boolean;
}

export interface SidebarHydrationResult {
  plugins: SidebarPluginEntry[];
  isAdmin: boolean;
}

// Module-scoped and shared by every caller (SidebarPluginIcons and
// AdminConsoleIcon both mount unconditionally on an offline route, and both
// need this) so only one `/api/plugins/sidebar` request is ever made per page
// load, regardless of how many components ask — same dedup pattern as
// AccountMenu's `hydrateSessionOnce`.
let sidebarHydrationPromise: Promise<SidebarHydrationResult | null> | null = null;

function hydrateSidebarOnce(): Promise<SidebarHydrationResult | null> {
  sidebarHydrationPromise ??= fetch('/api/plugins/sidebar')
    .then((res) => (res.ok ? res.json() : null))
    .catch(() => null);
  return sidebarHydrationPromise;
}

/**
 * Restores the real, personalized sidebar (plugin icons + admin status) on a
 * manifest-declared offline route (RFC 0072) for a live, online tab.
 *
 * `(platform)/layout.tsx` renders a fixed, identical-for-everyone neutral
 * shell for these routes server-side, because that exact response is what a
 * service worker precaches and may later replay to a *different* user
 * offline on a shared device — the per-user plugin list, order, and admin
 * status must never be baked into that cached document. But a live tab is
 * never the offline replay; once mounted, it can safely fetch the truth for
 * whoever is actually looking at the screen right now, same as
 * `AccountMenu`'s `hydrateUser`/`/api/auth/get-session` does for name/avatar.
 *
 * Returns `null` until hydration completes (or `hydrate` is false), so
 * callers keep rendering their neutral/SSR fallback in the meantime.
 */
export function useSidebarHydration(hydrate: boolean): SidebarHydrationResult | null {
  const [hydrated, setHydrated] = useState<SidebarHydrationResult | null>(null);

  useEffect(() => {
    if (!hydrate) return;
    let cancelled = false;
    hydrateSidebarOnce().then((result) => {
      if (!cancelled && result) setHydrated(result);
    });
    return () => {
      cancelled = true;
    };
  }, [hydrate]);

  return hydrated;
}
