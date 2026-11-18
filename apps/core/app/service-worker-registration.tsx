'use client';

import { useEffect, useState } from 'react';
import { UpdateNotice } from '@sovereignfs/ui';
import { TAKE_OVER_MESSAGE } from '../src/sw/message';

/**
 * Registers the service worker (RFC 0001), once the page has loaded. Only in production, where the worker is what
 * is shipped (in development a worker would stand between a page and its hot reload), only where a browser has
 * service workers, and only in a secure context, which a worker requires. Anywhere else it does nothing, and core
 * works as it did.
 *
 * A new version is announced, not swapped in silently (RFC 0001 A3): a new worker waits, this shows a notice, and
 * Reload asks it to take over and reloads the page once it has. The page checks for a new version whenever it comes
 * back into view, so an installed core left open still hears of one.
 */
export function ServiceWorkerRegistration({ appName }: { appName: string }) {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
    const container = navigator.serviceWorker;
    let registration: ServiceWorkerRegistration | undefined;

    // A worker that has installed while another controls the page is a new version; on a first visit there is no
    // controller, and the worker simply starts.
    const watch = (found: ServiceWorkerRegistration) => {
      if (found.waiting && container.controller) setWaiting(found.waiting);
      found.addEventListener('updatefound', () => {
        const installing = found.installing;
        installing?.addEventListener('statechange', () => {
          if (installing.state === 'installed' && container.controller) setWaiting(installing);
        });
      });
    };
    const register = () => {
      container
        .register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .then((found) => {
          registration = found;
          watch(found);
        })
        .catch(() => undefined);
    };
    const recheck = () => {
      if (document.visibilityState === 'visible') registration?.update().catch(() => undefined);
    };

    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
    document.addEventListener('visibilitychange', recheck);
    return () => {
      window.removeEventListener('load', register);
      document.removeEventListener('visibilitychange', recheck);
    };
  }, []);

  if (!waiting) return null;
  return (
    <UpdateNotice
      appName={appName}
      reloading={reloading}
      onDismiss={() => setWaiting(null)}
      onReload={() => {
        setReloading(true);
        navigator.serviceWorker.addEventListener(
          'controllerchange',
          () => window.location.reload(),
          {
            once: true,
          },
        );
        waiting.postMessage(TAKE_OVER_MESSAGE);
      }}
    />
  );
}
