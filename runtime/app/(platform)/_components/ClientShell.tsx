'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { ToastProvider } from '@sovereignfs/ui';
import { computeViewportHeight } from '@/src/viewport-height';

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

/** Wraps the shell in client providers and installs viewport-sync hooks. */
export function ClientShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

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
