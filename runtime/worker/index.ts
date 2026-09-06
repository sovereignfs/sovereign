/// <reference lib="webworker" />
/**
 * The runtime's service worker (PLT-09, SRS §3.11). Bundled by
 * `runtime/scripts/build-sw.ts` after `next build` into `public/sw.js`, with
 * the precache manifest injected at `self.__SW_MANIFEST`; registered by
 * `app/_components/ServiceWorkerRegistration.tsx`. Disabled in development
 * (nothing builds it, and the registration component unregisters any stale
 * one) so it never interferes with HMR.
 *
 * - Precaching + routing: Serwist (`./routes.ts` holds the route table and
 *   the reasoning behind each entry).
 * - Web Push (RFC 0016): the `push` / `notificationclick` handlers below.
 */

import { Serwist, type PrecacheEntry, type SerwistGlobalConfig } from 'serwist';
import { isDocumentRequest, runtimeCaching } from './routes';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  precacheOptions: { cleanupOutdatedCaches: true, concurrency: 10 },
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: false,
  disableDevLogs: true,
  runtimeCaching,
  // `/offline` is precached (`build-sw.ts` adds it to the manifest with the
  // build id as its revision) and stands in for any document request whose
  // strategy fails — offline, or past the gated-page network timeout.
  fallbacks: { entries: [{ url: '/offline', matcher: isDocumentRequest }] },
});

serwist.addEventListeners();

interface PushPayload {
  title: string;
  body?: string;
  url?: string;
  icon?: string;
}

self.addEventListener('push', (event: PushEvent) => {
  if (!event.data) return;
  const data = event.data.json() as PushPayload;

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon ?? '/icons/icon-192x192.png',
      badge: '/icons/icon-192x192.png',
      data: { url: data.url },
    }),
  );
});

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();

  const url = (event.notification.data as { url?: string } | null)?.url;
  if (!url) return;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus an existing tab if one is already open at that URL.
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
