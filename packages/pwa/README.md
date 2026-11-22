# @sovereignfs/pwa

[![npm](https://img.shields.io/npm/v/@sovereignfs/pwa?label=npm)](https://www.npmjs.com/package/@sovereignfs/pwa) [![licence](https://img.shields.io/badge/licence-MPL--2.0-blue)](https://github.com/sovereignfs/sovereign/blob/main/packages/pwa/LICENSE)

What makes a [Sovereign](https://github.com/sovereignfs/sovereign) app installable on a phone and a desktop: its web app manifest, a
service worker that keeps nothing of a person, and a new version announced instead of swapped in. The design is
[RFC 0001](https://github.com/sovereignfs/sovereign/blob/main/docs/rfcs/0001-installable-core.md), amendment 1. An app made with
`npm create @sovereignfs app` uses it already.

```ts
// app/manifest.ts
import { manifest } from '@sovereignfs/pwa';
export default () => manifest({ name: 'Notes', description: 'Notes, kept on your instance' });

// app/sw.js/route.ts
import { serviceWorkerResponse, serviceWorkerSource } from '@sovereignfs/pwa';
export const GET = () =>
  serviceWorkerResponse(serviceWorkerSource({ version: buildId, precache: builtFiles }));

// app/layout.tsx
import { pwaMetadata, pwaViewport } from '@sovereignfs/pwa';
import { ServiceWorkerRegistration } from '@sovereignfs/pwa/client';
export const metadata = { title: 'Notes', ...pwaMetadata({ name: 'Notes' }) };
export const viewport = pwaViewport();
// …and <ServiceWorkerRegistration appName="Notes" /> in the body.
```

- **The manifest** has `standalone` display, icons of each size a browser asks for (served by the app at `/pwa-icon/192`, `/512` and
  `/maskable`), and `launch_handler` and `handle_links: 'preferred'`, so core can open the installed app instead of a browser view where the
  device allows it. Its `id` is the start address unless you set one: never change it once people have installed the app.
- **The worker keeps only an allow-list** of what is the same for everyone: the build's files under `/_next/static/`, the icons, the
  manifest, and a shell page if you give one, which must hold nothing of a person. It never stores a page of a person or an API answer,
  never touches a request with a query string, an `Authorization` header or another origin, and answers a navigation that fails with a page
  of its own (or the shell).
- **A new version waits.** `ServiceWorkerRegistration` (from `@sovereignfs/pwa/client`, with `@sovereignfs/ui`'s `UpdateNotice`) says a new
  version is ready; Reload has it take over. It registers only in production, over https or on `localhost`.
- **Notifications (Web Push)**, when the app asks: `serviceWorkerSource({ …, push: { name, icon, badge?, handlers? } })` adds a
  `push` handler that shows every push (one it cannot read shows the app's name; it stores nothing) and a `notificationclick` handler
  that opens only a path on the app's own origin. `handlers` is the app's own JavaScript defining
  `async function onPushKind(kind, data, message)`, which may return what to show instead. From `@sovereignfs/pwa/client`, `usePush()`
  gives the state of this device and `turnOn` and `turnOff`, for `@sovereignfs/ui`'s `PushControl`; `turnOffPush()` is called before
  signing out. The server's side is [`@sovereignfs/push`](https://www.npmjs.com/package/@sovereignfs/push)
  ([RFC 0009](https://github.com/sovereignfs/sovereign/blob/main/docs/rfcs/0009-web-push.md)).
- **Background Sync**, when the app asks: `sync: { tags, message?, handlers? }` answers a sync with one of the app's tags by posting
  `{ type: message, tag }` (default `SYNC_MESSAGE`) to every open window, which syncs through its own code; or, with `handlers` defining
  `async function onSync(tag)`, runs that instead. A sync with any other tag is left alone.
- **The app's own answers**: `fetchHandlers`, JavaScript defining `function onFetch(request, url)`, is asked about a request the worker
  would leave to the network (never a navigation, never a kept file) and returns a promise of a response, or nothing. It is for what is
  the app's and the same for everyone, such as map tiles; it never stores anything of a person, and a cache it keeps is named with
  `cachePrefix` so a new version deletes it.
- **A content security policy** needs `PWA_CSP_DIRECTIVES`: `worker-src 'self'` and `manifest-src 'self'`.

The main entry has no React and no Node built-in, so a `proxy.ts` can import it. Licence MPL-2.0.
