import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { runtimeCaching } from '../../next.config';

/**
 * Reproduces the exact failure mode that disabled the `pages`/`offline-shells`
 * service-worker routes in production: `workbox-build` serializes every
 * `runtimeCaching[].urlPattern` and `.options.plugins[].{cacheKeyWillBeUsed,
 * handlerDidError}` function via `Function.prototype.toString()` into the
 * generated `sw.js`. That captures only the function's own source text — a
 * reference to anything outside it (an imported helper, another top-level
 * `const`/`function` in next.config.ts, even one defined right next to it in
 * the same file) becomes a dangling free identifier in the generated worker,
 * throwing `ReferenceError` the first time the route is matched. Nothing in
 * `workbox-routing`'s match path catches that error, so it silently disables
 * the SW's entire custom routing — not just the offending entry.
 *
 * `vm.runInContext` gives each function a fresh V8 realm with only the
 * globals listed below — the same shape of isolation the real generated
 * `sw.js` has via its own separate global scope. A function that closes over
 * this file's module scope throws here exactly as it would in production;
 * one that only reads `self.__sovereign*` does not.
 */
function isolate<T extends (...args: never[]) => unknown>(
  fn: T,
  globals: Record<string, unknown>,
): T {
  const context = vm.createContext({ ...globals });
  return vm.runInContext(`(${fn.toString()})`, context) as T;
}

interface WorkboxPluginLike {
  cacheKeyWillBeUsed?: (...args: never[]) => unknown;
  cacheWillUpdate?: (...args: never[]) => unknown;
  handlerDidError?: (...args: never[]) => unknown;
}
interface RuntimeCachingEntryLike {
  urlPattern?: unknown;
  handler?: unknown;
  options?: { plugins?: WorkboxPluginLike[]; cacheName?: unknown };
}

const cachesStub = { match: async () => undefined };
const responseStub = { error: () => ({ ok: false }) };
const fallbackStub = async () => ({ ok: true });

describe('next.config.ts runtimeCaching functions survive Workbox serialization', () => {
  const entries = runtimeCaching as unknown as RuntimeCachingEntryLike[];

  it('has the two custom entries this test is written for (offline-shells, pages)', () => {
    // Guards against silently testing nothing if the array shape changes.
    expect(entries.filter((e) => typeof e.urlPattern === 'function').length).toBe(2);
  });

  it('every urlPattern function runs standalone with self.__sovereignIsOfflineRoute unset', () => {
    for (const entry of entries) {
      if (typeof entry.urlPattern !== 'function') continue;
      const isolated = isolate(entry.urlPattern as (...args: never[]) => unknown, {
        self: {},
      });
      expect(() =>
        isolated({ url: new URL('https://example.test/console'), sameOrigin: true } as never),
      ).not.toThrow();
    }
  });

  // Both entries declare their own explicit, synchronous `handlerDidError`
  // rather than relying on next-pwa's auto-injected one
  // (`@ducanh2912/next-pwa`'s dist/index.js adds an `async` version to any
  // entry whose `plugins` don't already declare the key). `async` plugin
  // hooks here are never safe: see next.config.ts's comment on the `pages`
  // entry for why Next's `next.config.ts` SWC loader silently breaks them in
  // the generated `sw.js` specifically (a `ReferenceError` inside the SW
  // that Chrome hides behind a bare `net::ERR_FAILED` and only WebKit
  // surfaces directly) — a materially different failure from the
  // closure-over-module-scope one this file's own `isolate()` helper above
  // exists to catch.
  it('every plugin hook function runs standalone with no __sovereign* globals set', () => {
    for (const entry of entries) {
      for (const plugin of entry.options?.plugins ?? []) {
        for (const hook of [
          plugin.cacheKeyWillBeUsed,
          plugin.cacheWillUpdate,
          plugin.handlerDidError,
        ]) {
          if (typeof hook !== 'function') continue;
          const isolated = isolate(hook, {
            self: { fallback: fallbackStub },
            caches: cachesStub,
            Response: responseStub,
          });
          expect(() =>
            isolated({ request: { url: 'https://example.test/console' } } as never),
          ).not.toThrow();
        }
      }
    }
  });

  it('offline-shells matches only manifest-declared offline routes, not other same-origin pages', () => {
    // Both custom entries are matched by position (offline-shells is listed
    // first so it wins over the general "pages" entry for the same path) —
    // see the "has the two custom entries" test above for the array-shape guard.
    const [offlineShellsEntry, pagesEntry] = entries.filter(
      (e) => typeof e.urlPattern === 'function',
    );
    if (!offlineShellsEntry || !pagesEntry) throw new Error('expected two matcher entries');
    const isOfflineRoute = (pathname: string) => pathname === '/shopper';

    const shellsMatcher = isolate(offlineShellsEntry.urlPattern as (...args: never[]) => boolean, {
      self: { __sovereignIsOfflineRoute: isOfflineRoute },
    });
    const pagesMatcher = isolate(pagesEntry.urlPattern as (...args: never[]) => boolean, {
      self: { __sovereignIsOfflineRoute: isOfflineRoute },
    });

    const shopper = { url: new URL('https://example.test/shopper'), sameOrigin: true };
    const console_ = { url: new URL('https://example.test/console'), sameOrigin: true };
    const api = { url: new URL('https://example.test/api/health'), sameOrigin: true };
    const crossOrigin = { url: new URL('https://other.test/shopper'), sameOrigin: false };

    expect(shellsMatcher(shopper as never)).toBe(true);
    expect(shellsMatcher(console_ as never)).toBe(false);
    expect(shellsMatcher(crossOrigin as never)).toBe(false);

    expect(pagesMatcher(shopper as never)).toBe(false);
    expect(pagesMatcher(console_ as never)).toBe(true);
    expect(pagesMatcher(api as never)).toBe(false);
    expect(pagesMatcher(crossOrigin as never)).toBe(false);
  });

  it('fails toward the safe path when __sovereignIsOfflineRoute is absent', () => {
    const [offlineShellsEntry, pagesEntry] = entries.filter(
      (e) => typeof e.urlPattern === 'function',
    );
    if (!offlineShellsEntry || !pagesEntry) throw new Error('expected two matcher entries');
    const shellsMatcher = isolate(offlineShellsEntry.urlPattern as (...args: never[]) => boolean, {
      self: {},
    });
    const pagesMatcher = isolate(pagesEntry.urlPattern as (...args: never[]) => boolean, {
      self: {},
    });
    const req = { url: new URL('https://example.test/shopper'), sameOrigin: true };

    // "not an offline-shell route" — falls through to the "pages" entry.
    expect(shellsMatcher(req as never)).toBe(false);
    expect(pagesMatcher(req as never)).toBe(true);
  });

  // Regression coverage for the auth-bypass fix: `pages` must never cache a
  // response it could later replay to a signed-out or different user. Live
  // testing found next-pwa's own default `start-url` route caching `/`
  // unpartitioned and session-blind was exactly this failure, on a route
  // this file's `runtimeCaching` array never even covered — see the comment
  // above this array's declaration in next.config.ts. `pages` stays
  // `NetworkFirst` (workbox-build rejects `networkTimeoutSeconds` on any
  // other handler), but its `cacheWillUpdate` unconditionally returns `null`
  // — the standard Workbox idiom for "never actually store this response" —
  // so it behaves like `NetworkOnly` in every way that matters: a cache
  // lookup on failure is always a guaranteed miss.
  it('"pages" declares a cacheWillUpdate that unconditionally refuses to cache', async () => {
    const pagesEntry = entries.find(
      (e) => typeof e.urlPattern === 'function' && e.options?.cacheName !== 'offline-shells',
    );
    if (!pagesEntry) throw new Error('expected the "pages" entry');
    expect(pagesEntry.handler).toBe('NetworkFirst');

    const cacheWillUpdate = pagesEntry.options?.plugins?.find(
      (p) => typeof p.cacheWillUpdate === 'function',
    )?.cacheWillUpdate;
    if (!cacheWillUpdate) throw new Error('expected a cacheWillUpdate plugin on "pages"');
    // Not `async` (see next.config.ts's comment on this entry), but it still
    // returns a `Promise<null>` via a plain `Promise.resolve()` call to
    // satisfy Workbox's `CacheWillUpdateCallback` type — that's a
    // synchronous function returning a Promise object, not the `async`
    // keyword, so it isn't subject to the SWC downleveling this test suite
    // exists to guard against.
    const isolated = isolate(cacheWillUpdate, {});
    await expect(isolated({ response: { ok: true, status: 200 } } as never)).resolves.toBeNull();
  });

  // Regression coverage for the `_async_to_generator` ReferenceError bug:
  // root-caused live on a real device (iOS Simulator Safari/WebKit) as a
  // genuinely broken offline `/console` fallback, not the automation
  // artifact it first looked like. Next's `next.config.ts` SWC loader
  // globally retranspiles every module reached via `require()` from this
  // file — including third-party ones like `@ducanh2912/next-pwa` — which
  // downlevels `async` functions to `_async_to_generator(...)` calls whose
  // helper definitions never survive `workbox-build`'s
  // `Function.prototype.toString()` capture into `sw.js`. No `async`
  // function anywhere in this file's `runtimeCaching` plugin hooks can be
  // safe from that, so this guards the property directly rather than
  // re-deriving the mechanism per hook.
  it('no plugin hook function is declared async (see next.config.ts comment on "pages")', () => {
    for (const entry of entries) {
      for (const plugin of entry.options?.plugins ?? []) {
        for (const hook of [
          plugin.cacheKeyWillBeUsed,
          plugin.cacheWillUpdate,
          plugin.handlerDidError,
        ]) {
          if (typeof hook !== 'function') continue;
          expect(hook.toString().trimStart().startsWith('async')).toBe(false);
        }
      }
    }
  });

  it('"/" matches offline-shells (not pages) once __sovereignIsOfflineRoute reports it', () => {
    const [offlineShellsEntry, pagesEntry] = entries.filter(
      (e) => typeof e.urlPattern === 'function',
    );
    if (!offlineShellsEntry || !pagesEntry) throw new Error('expected two matcher entries');
    // Mirrors registry.ts's getOfflineRoutePrefixes() prepending '/' only
    // when Launcher itself is offline-first.
    const isOfflineRoute = (pathname: string) => pathname === '/' || pathname === '/launcher';

    const shellsMatcher = isolate(offlineShellsEntry.urlPattern as (...args: never[]) => boolean, {
      self: { __sovereignIsOfflineRoute: isOfflineRoute },
    });
    const pagesMatcher = isolate(pagesEntry.urlPattern as (...args: never[]) => boolean, {
      self: { __sovereignIsOfflineRoute: isOfflineRoute },
    });

    const root = { url: new URL('https://example.test/'), sameOrigin: true };
    expect(shellsMatcher(root as never)).toBe(true);
    expect(pagesMatcher(root as never)).toBe(false);
  });
});
