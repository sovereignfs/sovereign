/// <reference lib="webworker" />
/**
 * Custom service worker additions, bundled into the generated Workbox SW by
 * @ducanh2912/next-pwa:
 *
 * - Web Push (RFC 0016) — `push` / `notificationclick` below.
 * - Offline session assertion and per-user cache partitioning (research 0012)
 *   — see `./offline-session`, imported for its side effect of installing the
 *   `__sovereign*` globals the generated worker's `cacheKeyWillBeUsed` hook
 *   calls. That hook is stringified into `sw.js` by workbox-build and so
 *   cannot import anything itself; this file can, and is `importScripts`-ed
 *   ahead of any `fetch` event.
 *
 * ESLint and Prettier ignore this file (it runs in the SW context, not the
 * Next.js context) — add to .eslintignore / .prettierignore if needed.
 */

import './offline-session';

// SW-global scope.
declare const self: ServiceWorkerGlobalScope;

interface SignOutMessage {
  type: 'sovereign:sign-out';
  userId: string;
}

/**
 * Sign-out purge. The page cannot delete another origin-scoped cache partition
 * on the worker's behalf reliably during an unload, so it posts the user id
 * here and the worker drops that user's cached documents. Scoped to one user
 * so a second account signed in on the same device keeps its cache.
 */
self.addEventListener('message', (event: ExtendableMessageEvent) => {
  const data = event.data as SignOutMessage | null;
  if (data?.type !== 'sovereign:sign-out' || typeof data.userId !== 'string') return;
  const purge = (self as unknown as { __sovereignPurgeUser?: (id: string) => Promise<void> })
    .__sovereignPurgeUser;
  if (purge) event.waitUntil(purge(data.userId));
});

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
