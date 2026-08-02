'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ToastProvider } from '@sovereignfs/ui';
import { installWebBridge } from '@sovereignfs/bridge';
import { offline } from '@sovereignfs/sdk/offline';
import { underPrefix } from '@/src/route-guard';
import { computeViewportHeight } from '@/src/viewport-height';
import type { MobileChromeOverride } from '@/src/registry';
import { mobileFooterVisible, mobileHeaderVisible } from '@/src/mobile-chrome';

/**
 * Registers the device bridge (RFC 0083 §1, workstream 0003 leg 1) once,
 * as a module-level side effect rather than inside the component or a
 * `useEffect` — resolves RFC 0083 open question 7 ("where does the client
 * bootstrap that calls `provideBridge()` live, and how is it guaranteed to
 * run before a plugin's first `supports()` call?"). `provideHost()` has
 * `runtime/instrumentation.ts` as an unambiguous once-before-any-request
 * server-side hook; the client side has no exact equivalent, but a
 * module-level call in the platform shell's root client component is the
 * closest match — it runs exactly once per page load, as soon as this
 * chunk is evaluated, which is earlier and more reliable than waiting for
 * a `useEffect` (which waits for React's commit phase). `ClientShell` is
 * the platform layout's single client-side entry point
 * (`(platform)/layout.tsx` renders it around every route), so this covers
 * every authenticated page.
 */
installWebBridge();

/** localStorage marker for the last authenticated user id this device purged
 *  the offline cache for. `runtime/src/complete-sign-in.ts` already purges
 *  unconditionally on every fresh login, closing most of the "previous
 *  session ended without signing out" gap — this catches the remaining
 *  case where the *same* browser session simply persists across a device
 *  handoff (a still-valid cookie, no fresh login) as a different account
 *  than last observed mounting the shell. */
const LAST_USER_KEY = 'sovereign:offline-last-user';

function purgeIfUserChanged(userId: string | null): void {
  if (!userId) return;
  let lastUserId: string | null = null;
  try {
    lastUserId = localStorage.getItem(LAST_USER_KEY);
  } catch {
    return; // localStorage unavailable — nothing to compare against, skip.
  }
  if (lastUserId === userId) return;
  void offline.clearAll().finally(() => {
    try {
      localStorage.setItem(LAST_USER_KEY, userId);
    } catch {
      // best-effort — a missed write just means we re-purge next mount.
    }
  });
}

/** Read the current visual viewport height and the rendered mobile header height,
 *  then push both as CSS custom properties onto :root so iOS-PWA-specific stale
 *  values (100dvh doesn't recompute until a scroll event fires after resume;
 *  position:fixed elements inherit --sv-dialog-inset-top from :root, which
 *  won't update if the header's env(safe-area-inset-top) is stale) are resolved
 *  from live DOM measurements instead of cached CSS engine values. */
function syncViewport() {
  document.documentElement.style.setProperty('--sv-vh', `${computeViewportHeight()}px`);

  // Measure the rendered mobile header rather than re-deriving the safe-area
  // formula in JS (env() is not readable from JS directly).
  const mobileHeader = document.querySelector('[data-mobile-header]') as HTMLElement | null;
  if (mobileHeader) {
    document.documentElement.style.setProperty(
      '--sv-dialog-inset-top',
      `${mobileHeader.offsetHeight}px`,
    );
  }
}

/**
 * Wraps the shell in client providers and installs viewport-sync hooks.
 *
 * Also works around a Next.js App Router caching gap: `(platform)/layout.tsx`
 * renders a degraded, user-neutral shell (no personalized sidebar plugin
 * icons) for manifest-declared offline routes (RFC 0074), and independently
 * renders a per-plugin reduced mobile chrome (RFC 0075) — both required so a
 * service-worker-precached document never bakes in one user's personalized
 * chrome, and so a plugin's `shellConfig.mobileHeader`/`mobileFooter` choice
 * actually takes effect. But that layout is shared across every platform
 * route, and Next.js only re-fetches/re-executes a shared layout when the
 * navigation actually changes that segment — client-side navigation between
 * sibling routes reuses its already-rendered output instead of re-reading
 * request headers. So once a live tab soft-navigates into an offline route
 * (e.g. `/launcher`) or into/out of a plugin with reduced mobile chrome, the
 * previous route's shell state keeps rendering for every subsequent
 * client-side navigation, even to routes that don't share it, until a hard
 * reload. `offlineRoutePrefixes` and `mobileChromeConfig` (both computed
 * server-side from the manifest registry, not per-request state) let this
 * component detect exactly the pathnames where either flips and force a
 * `router.refresh()` only there — everywhere else keeps the normal,
 * unrefreshed client navigation.
 */
export function ClientShell({
  children,
  userId,
  offlineRoutePrefixes,
  mobileChromeConfig,
}: {
  children: React.ReactNode;
  userId: string | null;
  offlineRoutePrefixes: string[];
  mobileChromeConfig: MobileChromeOverride[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const previousPathnameRef = useRef(pathname);

  // Mount-only: catches a persisted session belonging to a different user
  // than this device last purged for (see purgeIfUserChanged above).
  useEffect(() => {
    purgeIfUserChanged(userId);
  }, []);

  useEffect(() => {
    const previousPathname = previousPathnameRef.current;
    previousPathnameRef.current = pathname;
    if (previousPathname === pathname) return;
    const isOffline = (p: string) => offlineRoutePrefixes.some((prefix) => underPrefix(p, prefix));
    const headerVisible = mobileHeaderVisible(pathname, mobileChromeConfig);
    const footerVisible = mobileFooterVisible(pathname, mobileChromeConfig);
    if (
      isOffline(previousPathname) !== isOffline(pathname) ||
      headerVisible !== mobileHeaderVisible(previousPathname, mobileChromeConfig) ||
      footerVisible !== mobileFooterVisible(previousPathname, mobileChromeConfig)
    ) {
      router.refresh();
    }
    // The mobile header's rendered height only varies (today) by whether it's
    // present at all — every default-shell plugin shares identical header
    // markup otherwise — so this doesn't need a re-measurement, just an
    // immediate, DOM-independent correction: syncViewport()'s mount-time
    // measurement never re-runs on a plain pathname change (its effect has an
    // empty dependency array), so without this, --sv-dialog-inset-top would
    // keep the previous route's stale px value across a header-visibility
    // transition instead of picking up the CSS-cascaded 0px (header hidden)
    // or the standard formula (header shown) that shell.module.css now
    // derives from data-mobile-header-hidden.
    if (!headerVisible) {
      document.documentElement.style.setProperty('--sv-dialog-inset-top', '0px');
    } else {
      document.documentElement.style.removeProperty('--sv-dialog-inset-top');
    }
  }, [pathname, router, offlineRoutePrefixes, mobileChromeConfig]);

  useEffect(() => {
    syncViewport();
    const vv = window.visualViewport;
    if (vv) vv.addEventListener('resize', syncViewport);
    document.addEventListener('visibilitychange', syncViewport);
    window.addEventListener('orientationchange', syncViewport);
    return () => {
      if (vv) vv.removeEventListener('resize', syncViewport);
      document.removeEventListener('visibilitychange', syncViewport);
      window.removeEventListener('orientationchange', syncViewport);
    };
  }, []);

  // Reset the content scroll position on every client-side navigation so the
  // new page always starts at the top (Next.js App Router resets window scroll
  // but the scrollable element is the <main> cell, not the window).
  useEffect(() => {
    document.getElementById('main-scroll')?.scrollTo({ top: 0 });
  }, [pathname]);

  return <ToastProvider>{children}</ToastProvider>;
}
