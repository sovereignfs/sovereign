'use client';

import { useEffect, useState } from 'react';

/**
 * useIsOffline — whether the browser currently has no network connection.
 *
 * SSR-safe: always initialises to `false` (online) so the server-rendered HTML
 * matches the first client render, then reads the real `navigator.onLine`
 * value in `useEffect`. This picks up the case where the page loaded already
 * offline (e.g. served from the service-worker cache) at the cost of an
 * imperceptible one-frame delay before the offline state appears — the same
 * trade-off `OfflineBanner` makes, which this hook was extracted from so every
 * consumer shares one connectivity source instead of re-deriving it slightly
 * differently (research 0012, epic task 2.32).
 *
 * Reflects only `navigator.onLine` — true whenever the OS reports a network
 * interface is up, even without real upstream connectivity (e.g. Wi-Fi with no
 * internet). That is a known limitation of the browser API itself, not of this
 * hook; there is currently no better cross-browser signal available.
 */
export function useIsOffline(): boolean {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    setIsOffline(!navigator.onLine);

    const handleOffline = () => setIsOffline(true);
    const handleOnline = () => setIsOffline(false);

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  return isOffline;
}
