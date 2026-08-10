/// <reference lib="webworker" />
/**
 * Custom service worker additions, bundled into the generated Workbox SW by
 * @ducanh2912/next-pwa:
 *
 * - Web Push (RFC 0016) — `push` / `notificationclick` below.
 * - Manifest-declared offline route detection (research 0012) — see
 *   `./offline-session`, imported for its side effect of installing the
 *   `__sovereignIsOfflineRoute` global the generated worker's
 *   `runtimeCaching` matchers call. Those matchers are stringified into
 *   `sw.js` by workbox-build and so cannot import anything themselves; this
 *   file can, and is `importScripts`-ed ahead of any `fetch` event.
 *
 * ESLint and Prettier ignore this file (it runs in the SW context, not the
 * Next.js context) — add to .eslintignore / .prettierignore if needed.
 */

import './offline-session';

// SW-global scope.
declare const self: ServiceWorkerGlobalScope;

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
