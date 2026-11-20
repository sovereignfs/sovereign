import { TAKE_OVER_MESSAGE } from './message.js';

/**
 * A Sovereign app's service worker, as the text served at `/sw.js` (RFC 0001 A7). It is plain JavaScript in a string, not a module
 * bundled with the app, so what a browser runs is exactly what a test evaluates. It does three things and nothing more:
 *
 * 1. **Keeps what is the same for everyone and never changes at its address**, on an allow-list: the build's files under
 *    `/_next/static/` (their names carry a hash of their contents), the icons, the manifest; and, if the app has one, a shell page
 *    that holds nothing of a person. Only `GET`s of the app's own origin, with no query string and no `Authorization` header, and only
 *    answers that are a plain 200 with no cookie. Everything else (every page of a person, every API answer, every other site) is not
 *    handled: the browser goes to the network as if there were no worker. **It never stores a page of a person.**
 * 2. **Answers a navigation that fails** (the network is down, or does not answer in time) with the kept shell page if there is one,
 *    or else with a page of its own, built here, that says so and offers to try again.
 * 3. **Waits to take over** until a page asks it to (`TAKE_OVER_MESSAGE`), so a new version is announced rather than swapped in under
 *    someone; the registration in `@sovereignfs/pwa/client` shows the notice.
 * 4. **Shows a push**, only when the app asks for it (`push`, RFC 0009 §2.1): every push shows something, since a browser stops
 *    allowing pushes that show nothing, and opening one goes only to a path on this origin. Nothing of a push is stored.
 */

/** Web Push in the worker (RFC 0009 §2.1). */
export type WorkerPushOptions = {
  /** The app's name: the title of a push that cannot be read or has none. */
  name: string;
  /** A path of the app's own icon, shown with every push. */
  icon: string;
  /** A path of the small monochrome icon some systems show in their status bar. */
  badge?: string;
  /**
   * JavaScript text defining `async function onPushKind(kind, data, message)`, for an app's own kinds: it may return
   * `{ title, body?, path?, tag? }` to show instead, or nothing to show the message as it came. It runs in the worker, so it may read
   * the device's own storage (a wake); it is the app's code, as trusted as the rest of the worker.
   */
  handlers?: string;
};

export type WorkerOptions = {
  /** Changes with each build (Next's `BUILD_ID`): the cache's name carries it, and a new one deletes the old caches. */
  version: string;
  /** The start of the cache's name, so the worker deletes only its own old caches. Default `sv-app-`. */
  cachePrefix?: string;
  /**
   * Paths to keep when the worker installs, so the app can start with no network: the build's files. Each must be on the allow-list.
   */
  precache?: readonly string[];
  /**
   * A page that holds nothing of a person, kept at install and shown for a navigation that fails. It must be the same for everyone: the
   * page reads who is signed in from the device itself, if it needs to. Without one, a failed navigation gets the worker's own page.
   */
  shell?: string;
  /**
   * More paths to keep, besides `/_next/static/`, `/icons/`, `/pwa-icon/`, `/manifest.webmanifest`, `/favicon.ico` and `/icon.svg`. A
   * path ending in `/` keeps everything under it. Never a page or an API.
   */
  keep?: readonly string[];
  /** How long a navigation may take before the offline answer is given. Default 8 seconds. */
  navigationTimeoutMs?: number;
  /** The colours of the worker's own offline page: the page and the text, light and dark. */
  offlineColors?: { light?: [string, string]; dark?: [string, string] };
  /** Shows Web Push (RFC 0009 §2.1). Without it the worker has no push handlers at all. */
  push?: WorkerPushOptions;
};

/** What the worker keeps unless told more. */
export const DEFAULT_KEEP = [
  '/_next/static/',
  '/icons/',
  '/pwa-icon/',
  '/manifest.webmanifest',
  '/favicon.ico',
  '/icon.svg',
] as const;

/** A path the worker may name: on this origin, no query, no fragment, no space. */
const PATH = /^\/(?!\/)[^\s?#]*$/;
const COLOR = /^#[0-9a-f]{3,8}$/i;

function check(path: string, what: string): string {
  if (!PATH.test(path))
    throw new TypeError(`${what} must be a path on the app, with no query: got ${path}`);
  return path;
}

function offlinePage(colors: Required<NonNullable<WorkerOptions['offlineColors']>>): string {
  const [lightPage, lightText] = colors.light;
  const [darkPage, darkText] = colors.dark;
  for (const color of [lightPage, lightText, darkPage, darkText])
    if (!COLOR.test(color)) throw new TypeError(`offlineColors must be hex colours: got ${color}`);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>You’re offline</title><style>html{background:${lightPage};color:${lightText}}@media (prefers-color-scheme:dark){html{background:${darkPage};color:${darkText}}}body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:1.5rem;box-sizing:border-box;font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;text-align:center}main{max-width:22rem}h1{margin:0 0 .5rem;font-size:1.25rem}p{margin:0 0 1.5rem;opacity:.7}a{display:inline-block;padding:.6rem 1.2rem;border-radius:.5rem;border:1px solid currentColor;color:inherit;text-decoration:none}</style></head><body><main><h1>You’re offline</h1><p>This page can’t reach the server right now. Check your connection, then try again.</p><a href="">Try again</a></main></body></html>`;
}

/** The worker's push and notificationclick handlers, appended to its text only when the app asks for push. */
function pushSource(push: WorkerPushOptions): string {
  if (typeof push.name !== 'string' || push.name.trim() === '')
    throw new TypeError("push.name must be the app's name");
  const icon = check(push.icon, 'push.icon');
  const badge = push.badge === undefined ? null : check(push.badge, 'push.badge');
  if (push.handlers !== undefined && typeof push.handlers !== 'string')
    throw new TypeError('push.handlers must be JavaScript text');
  return `
// Web Push (RFC 0009 §2.1): what arrives is shown and is not kept; opening it goes to a path on this origin only.
var PUSH_NAME = ${JSON.stringify(push.name)};
var PUSH_ICON = ${JSON.stringify(icon)};
var PUSH_BADGE = ${JSON.stringify(badge)};
${push.handlers ?? ''}

function pushText(value, most) {
  if (typeof value !== 'string' || value === '') return undefined;
  var chars = Array.from(value);
  return chars.length > most ? chars.slice(0, most).join('') : value;
}

function ownPath(path) {
  return typeof path === 'string' && /^\\/(?![\\/\\\\])[^\\s\\\\]*$/.test(path) ? path : '/';
}

function readPush(event) {
  try {
    var message = event.data ? event.data.json() : null;
    return message && typeof message === 'object' && !Array.isArray(message) ? message : null;
  } catch (error) {
    return null;
  }
}

function pushShown(message) {
  var title = message && pushText(message.title, 120);
  var options = { icon: PUSH_ICON, data: { path: ownPath(message && message.path) } };
  if (PUSH_BADGE) options.badge = PUSH_BADGE;
  var body = message && pushText(message.body, 500);
  if (body) options.body = body;
  else if (!title) options.body = 'You have a new notification';
  var tag = message && pushText(message.tag, 100);
  if (tag) options.tag = tag;
  return { title: title || PUSH_NAME, options: options };
}

function pushDecide(message) {
  if (!message || typeof message.kind !== 'string' || typeof onPushKind !== 'function') return Promise.resolve(message);
  var data = message.data && typeof message.data === 'object' ? message.data : {};
  return Promise.resolve()
    .then(function () { return onPushKind(message.kind, data, message); })
    .then(function (instead) { return instead && typeof instead === 'object' ? instead : message; }, function () { return message; });
}

self.addEventListener('push', function (event) {
  var message = readPush(event);
  event.waitUntil(
    pushDecide(message)
      .then(function (shown) { return pushShown(shown); }, function () { return pushShown(message); })
      .then(function (shown) { return self.registration.showNotification(shown.title, shown.options); })
      .catch(function () { return self.registration.showNotification(PUSH_NAME, { icon: PUSH_ICON, body: 'You have a new notification', data: { path: '/' } }); })
  );
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var data = event.notification.data;
  var url = self.location.origin + ownPath(data && data.path);
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (pages) {
      for (var i = 0; i < pages.length; i += 1) {
        var page = pages[i];
        if (new URL(page.url).origin !== self.location.origin || !('focus' in page)) continue;
        return page.focus().then(function (focused) {
          if (focused && 'navigate' in focused) return focused.navigate(url).catch(function () { return undefined; });
        });
      }
      return self.clients.openWindow(url);
    })
  );
});
`;
}

/** The worker's text, for `/sw.js`. Throws on an option that would keep something it must not. */
export function serviceWorkerSource(options: WorkerOptions): string {
  if (!options.version || /[\s'"\\`]/.test(options.version))
    throw new TypeError('version must be a build id with no spaces or quotes');
  const prefix = options.cachePrefix ?? 'sv-app-';
  if (!/^[a-z0-9-]+$/.test(prefix))
    throw new TypeError(`cachePrefix must be letters, digits and hyphens: got ${prefix}`);
  const keep = [...DEFAULT_KEEP, ...(options.keep ?? []).map((path) => check(path, 'keep'))];
  const kept = (path: string) =>
    keep.some((k) => (k.endsWith('/') ? path.startsWith(k) : path === k));
  const precache = (options.precache ?? []).map((path) => check(path, 'precache'));
  for (const path of precache)
    if (!kept(path)) throw new TypeError(`precache may name only paths on the allow-list: ${path}`);
  const shell = options.shell === undefined ? null : check(options.shell, 'shell');
  const timeout = options.navigationTimeoutMs ?? 8000;
  const colors = {
    light: options.offlineColors?.light ?? ['#ffffff', '#18181b'],
    dark: options.offlineColors?.dark ?? ['#09090b', '#fafafa'],
  } as Required<NonNullable<WorkerOptions['offlineColors']>>;

  return `'use strict';
var PREFIX = ${JSON.stringify(prefix)};
var CACHE = PREFIX + ${JSON.stringify(options.version)};
var KEEP = ${JSON.stringify(keep)};
var PRECACHE = ${JSON.stringify(precache)};
var SHELL = ${JSON.stringify(shell)};
var TIMEOUT = ${timeout};
var TAKE_OVER = ${JSON.stringify(TAKE_OVER_MESSAGE)};
var OFFLINE = ${JSON.stringify(offlinePage(colors))};

function keptPath(path) {
  return KEEP.some(function (k) { return k.charAt(k.length - 1) === '/' ? path.indexOf(k) === 0 : path === k; });
}

function keptRequest(request) {
  if (request.method !== 'GET') return false;
  if (request.headers.has('authorization')) return false;
  var url = new URL(request.url);
  if (url.origin !== self.location.origin || url.search !== '') return false;
  return keptPath(url.pathname);
}

function keptResponse(response) {
  return response.status === 200 && response.type === 'basic' && !response.headers.has('set-cookie');
}

function fromCache(request) {
  return caches.open(CACHE).then(function (cache) {
    return cache.match(request).then(function (hit) {
      if (hit) return hit;
      return fetch(request).then(function (response) {
        if (keptResponse(response)) cache.put(request, response.clone());
        return response;
      });
    });
  });
}

function offlinePage() {
  return new Response(OFFLINE, {
    status: 503,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'",
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff'
    }
  });
}

function offline() {
  if (!SHELL) return Promise.resolve(offlinePage());
  return caches.open(CACHE).then(function (cache) {
    return cache.match(self.location.origin + SHELL).then(function (hit) { return hit || offlinePage(); });
  });
}

function navigate(request) {
  return new Promise(function (resolve) {
    var settled = false;
    var timer = setTimeout(function () { settled = true; resolve(offline()); }, TIMEOUT);
    fetch(request).then(
      function (response) { if (!settled) { clearTimeout(timer); resolve(response); } },
      function () { if (!settled) { clearTimeout(timer); resolve(offline()); } }
    );
  });
}

function keep(cache, path) {
  return fetch(new Request(self.location.origin + path)).then(function (response) {
    if (keptResponse(response)) return cache.put(self.location.origin + path, response);
  }).catch(function () { return undefined; });
}

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(CACHE).then(function (cache) {
    var all = (SHELL ? [SHELL] : []).concat(PRECACHE);
    var chain = Promise.resolve();
    for (var i = 0; i < all.length; i += 8) {
      (function (batch) {
        chain = chain.then(function () { return Promise.all(batch.map(function (path) { return keep(cache, path); })); });
      })(all.slice(i, i + 8));
    }
    return chain;
  }));
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (names) {
        return Promise.all(names.filter(function (name) { return name.indexOf(PREFIX) === 0 && name !== CACHE; }).map(function (name) { return caches.delete(name); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('message', function (event) {
  if (event.data === TAKE_OVER) self.skipWaiting();
});

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.mode === 'navigate') {
    event.respondWith(navigate(request));
    return;
  }
  if (keptRequest(request)) event.respondWith(fromCache(request));
});
${options.push ? pushSource(options.push) : ''}`;
}

/** The answer for `/sw.js`: script, fetched afresh every time, allowed to control the whole origin. */
export function serviceWorkerResponse(source: string): Response {
  return new Response(source, {
    headers: {
      'content-type': 'text/javascript; charset=utf-8',
      'cache-control': 'no-cache',
      'service-worker-allowed': '/',
      'x-content-type-options': 'nosniff',
    },
  });
}
