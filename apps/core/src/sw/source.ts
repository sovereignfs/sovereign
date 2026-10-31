import { THEME_COLORS } from '../pwa';

/**
 * The service worker, as the text core serves at `/sw.js` (RFC 0001, core-app §3.5). It is plain JavaScript in a
 * string, not a module bundled with the app, so what a browser runs is exactly what the tests run (they evaluate
 * this text), and a change to it is a change to this file and nothing else.
 *
 * It does two things and nothing more:
 *
 * 1. Keeps files that are the same for everyone and never change at their address: `GET`s of the built scripts,
 *    styles and fonts under `/_next/static/` (their names carry a hash of their contents) and the icons under
 *    `/icons/`. Cache first, one bounded cache. This is an allow-list: a path that is not on it is not kept.
 * 2. Answers a navigation that fails, because the network is down or does not answer in time, with a page of its
 *    own, built here from a string, so no page that belongs to a person is ever stored to show.
 *
 * Everything else, signed-in pages, every API call, every other origin, anything that is not a `GET`, is not
 * handled at all: the browser goes to the network as if there were no worker.
 */

/** The cache's name carries a version: a worker that changes what it keeps bumps it, and the others are deleted. */
export const CACHE_NAME = 'sv-static-1';

/** The most files kept; past it the oldest go. */
export const CACHE_LIMIT = 200;

/** How long a navigation may take before the offline page answers instead. */
export const NAVIGATION_TIMEOUT_MS = 8000;

const OFFLINE_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>You’re offline</title><style>html{background:${THEME_COLORS.light};color:#18181b}@media (prefers-color-scheme:dark){html{background:${THEME_COLORS.dark};color:#fafafa}}body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:1.5rem;box-sizing:border-box;font:16px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;text-align:center}main{max-width:22rem}h1{margin:0 0 .5rem;font-size:1.25rem}p{margin:0 0 1.5rem;opacity:.7}a{display:inline-block;padding:.6rem 1.2rem;border-radius:.5rem;color:inherit;background:currentColor;text-decoration:none}a span{color:${THEME_COLORS.light}}@media (prefers-color-scheme:dark){a span{color:${THEME_COLORS.dark}}}</style></head><body><main><h1>You’re offline</h1><p>This page can’t reach the server right now. Check your connection, then try again.</p><a href=""><span>Try again</span></a></main></body></html>`;

export const SERVICE_WORKER_SOURCE: string = String.raw`'use strict';

var CACHE = '${CACHE_NAME}';
var LIMIT = ${CACHE_LIMIT};
var TIMEOUT = ${NAVIGATION_TIMEOUT_MS};
var OFFLINE = ${JSON.stringify(OFFLINE_PAGE)};

/* What may be kept: files that are the same for everyone and never change at their address. */
var KEPT = [/^\/_next\/static\//, /^\/icons\//];

function keptRequest(request) {
  if (request.method !== 'GET') return false;
  if (request.headers.has('authorization')) return false;
  var url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  if (url.search !== '') return false;
  return KEPT.some(function (pattern) { return pattern.test(url.pathname); });
}

function keptResponse(response) {
  return response.status === 200 && response.type === 'basic' && !response.headers.has('set-cookie');
}

function trim(cache) {
  return cache.keys().then(function (keys) {
    return Promise.all(keys.slice(0, Math.max(0, keys.length - LIMIT)).map(function (key) { return cache.delete(key); }));
  });
}

function fromCache(request) {
  return caches.open(CACHE).then(function (cache) {
    return cache.match(request).then(function (hit) {
      if (hit) return hit;
      return fetch(request).then(function (response) {
        if (keptResponse(response)) {
          cache.put(request, response.clone()).then(function () { return trim(cache); });
        }
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

function navigate(request) {
  return new Promise(function (resolve) {
    var timer = setTimeout(function () { resolve(offlinePage()); }, TIMEOUT);
    fetch(request).then(
      function (response) { clearTimeout(timer); resolve(response); },
      function () { clearTimeout(timer); resolve(offlinePage()); }
    );
  });
}

self.addEventListener('install', function () { self.skipWaiting(); });

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (names) {
        return Promise.all(names.filter(function (name) { return name !== CACHE; }).map(function (name) { return caches.delete(name); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.mode === 'navigate') {
    event.respondWith(navigate(request));
    return;
  }
  if (keptRequest(request)) event.respondWith(fromCache(request));
});
`;
