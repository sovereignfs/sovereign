'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker (RFC 0001), once the page has loaded. Only in production, where the worker is what
 * is shipped (in development a worker would stand between a page and its hot reload), only where a browser has
 * service workers, and only in a secure context, which a worker requires. Anywhere else it does nothing, and core
 * works as it did.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
    const register = () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .catch(() => undefined);
    };
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
    return () => window.removeEventListener('load', register);
  }, []);
  return null;
}
