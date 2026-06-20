/// <reference lib="webworker" />
/**
 * Custom service worker additions for Web Push (RFC 0016).
 * Bundled into the generated Workbox SW by @ducanh2912/next-pwa.
 *
 * ESLint and Prettier ignore this file (it runs in the SW context, not the
 * Next.js context) — add to .eslintignore / .prettierignore if needed.
 */

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
