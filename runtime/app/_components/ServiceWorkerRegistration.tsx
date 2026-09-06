'use client';

import { useEffect } from 'react';

/**
 * Registers the production service worker (`public/sw.js`, built by
 * `runtime/scripts/build-sw.ts` — see `runtime/worker/index.ts`). Replaces the
 * registration entry `@ducanh2912/next-pwa` used to inject.
 *
 * In development nothing builds the worker, so any registration left over
 * from a previous production run on the same origin is removed instead —
 * a stale worker would otherwise keep serving old precached chunks and get
 * in the way of HMR. `NODE_ENV` is build-time by definition, so inlining it
 * here is the one legitimate use of the pattern.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    if (process.env.NODE_ENV !== 'production') {
      void navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => Promise.all(registrations.map((r) => r.unregister())))
        .catch(() => undefined);
      return;
    }

    void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);

    // Coming back online while looking at the `/offline` fallback (or a
    // stale offline shell) should show the live page, not wait for a manual
    // reload — the behaviour next-pwa's `reloadOnOnline` provided.
    const reload = () => window.location.reload();
    window.addEventListener('online', reload);
    return () => window.removeEventListener('online', reload);
  }, []);

  return null;
}
