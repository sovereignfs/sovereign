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
  handlerDidError?: (...args: never[]) => unknown;
}
interface RuntimeCachingEntryLike {
  urlPattern?: unknown;
  options?: { plugins?: WorkboxPluginLike[] };
}

const cachesStub = { match: async () => undefined };
const responseStub = { error: () => ({ ok: false }) };

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

  it('every plugin hook function runs standalone with no __sovereign* globals set', () => {
    for (const entry of entries) {
      for (const plugin of entry.options?.plugins ?? []) {
        for (const hook of [plugin.cacheKeyWillBeUsed, plugin.handlerDidError]) {
          if (typeof hook !== 'function') continue;
          const isolated = isolate(hook, {
            self: {},
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

    // "not an offline-shell route" — falls through to the per-user "pages" entry.
    expect(shellsMatcher(req as never)).toBe(false);
    expect(pagesMatcher(req as never)).toBe(true);
  });
});
