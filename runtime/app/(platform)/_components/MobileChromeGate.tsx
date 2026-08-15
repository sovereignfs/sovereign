'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import type { MobileChromeOverride } from '@/src/registry';
import { mobileFooterVisible, mobileHeaderVisible } from '@/src/mobile-chrome';

/**
 * Gates the mobile header/footer's presence on the *live* client-side
 * pathname rather than the server-rendered one.
 *
 * Why this exists: `(platform)/layout.tsx` is a shared layout across every
 * plugin route, and previously decided header/footer visibility once,
 * server-side, from request headers (`shellConfig.mobileHeader`/
 * `mobileFooter`, RFC 0075). A client-side navigation between two plugins
 * with different visibility doesn't re-execute that shared layout, so
 * `ClientShell` compensated by calling `router.refresh()` whenever the
 * crossing was detected. That refetch races with any other navigation
 * fired around the same time — e.g. a plugin's own route-sync
 * `router.replace()` on mount (see the tasks plugin's carousel) — and App
 * Router cancels an in-flight RSC fetch when a newer navigation supersedes
 * it. A cancelled refresh never reaches the client, so the previous route's
 * header/footer stays mounted indefinitely: a real, reproducible double
 * mobile-footer bug (visible after soft-navigating from the Launcher into a
 * plugin with `shellConfig.mobileFooter: false`, e.g. Tasks).
 *
 * Deriving visibility from `usePathname()` instead removes the race
 * entirely — it's a synchronous render-time computation, not a network
 * round trip, so it can never be cancelled by a concurrent navigation.
 * `mobileChromeConfig` is manifest-derived (not per-request/per-user state),
 * so it's safe to serialise to the client and reuse here.
 */
export function MobileHeaderGate({
  mobileChromeConfig,
  children,
}: {
  mobileChromeConfig: MobileChromeOverride[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  if (!mobileHeaderVisible(pathname, mobileChromeConfig)) return null;
  return <>{children}</>;
}

export function MobileFooterGate({
  mobileChromeConfig,
  children,
}: {
  mobileChromeConfig: MobileChromeOverride[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  if (!mobileFooterVisible(pathname, mobileChromeConfig)) return null;
  return <>{children}</>;
}
