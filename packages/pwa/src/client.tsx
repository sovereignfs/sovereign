'use client';

import { useEffect, useState } from 'react';
import { UpdateNotice } from '@sovereignfs/ui';
import { TAKE_OVER_MESSAGE } from './message.js';

export type ServiceWorkerRegistrationProps = {
  /** The app's name, for "A new version of … is ready". */
  appName: string;
  /** Default `/sw.js`. */
  path?: string;
};

/**
 * Registers the service worker once the page has loaded (RFC 0001 A7), only in production (in development a worker stands between a page
 * and its hot reload), only where the browser has service workers and in a secure context. A new version is announced, not swapped in:
 * when a new worker waits while an older one controls the page, the design system's `UpdateNotice` says so, and Reload asks it to take
 * over and reloads once it has. The page checks for a new version whenever it comes back into view, so an installed app left open still
 * hears of one. Renders nothing otherwise, and reads no browser global until it is mounted.
 */
export function ServiceWorkerRegistration({
  appName,
  path = '/sw.js',
}: ServiceWorkerRegistrationProps) {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
    const container = navigator.serviceWorker;
    let registration: ServiceWorkerRegistration | undefined;

    // A worker that installed while another controls the page is a new version; on a first visit there is no controller and it simply starts.
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
        .register(path, { scope: '/', updateViaCache: 'none' })
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
  }, [path]);

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
          { once: true },
        );
        waiting.postMessage(TAKE_OVER_MESSAGE);
      }}
    />
  );
}

export { InstallPrompt } from '@sovereignfs/ui';
export { SYNC_MESSAGE, TAKE_OVER_MESSAGE } from './message.js';
export {
  PUSH_ROUTE,
  PushError,
  pushAvailability,
  pushState,
  turnOffPush,
  turnOnPush,
  usePush,
} from './push.js';
export type { DevicePushState, PushState, UsePush } from './push.js';
