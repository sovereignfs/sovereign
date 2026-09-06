import { CacheFirst, NetworkOnly, StaleWhileRevalidate, type RuntimeCaching } from 'serwist';
import { describe, expect, it } from 'vitest';
import {
  createRuntimeCaching,
  isDocumentRequest,
  isGatedPageNavigation,
  isOfflineShellRequest,
  runtimeCaching,
} from '../../worker/routes';

/**
 * The service worker's route table is the mechanism behind
 * `docs/architecture-rules.md`'s "a cached authenticated document must never
 * be served to a different user" rule. These tests pin the classification of
 * requests into the three routes and — the part that matters — that the
 * route claiming per-user pages is `NetworkOnly`, a strategy with no cache
 * to write to at all.
 */

const ORIGIN = 'https://sovereign.example';

function match(
  pathname: string,
  init: { mode?: RequestMode; destination?: RequestDestination; origin?: string } = {},
) {
  const url = new URL(pathname, init.origin ?? ORIGIN);
  const request = {
    mode: init.mode ?? 'navigate',
    destination: init.destination ?? 'document',
    url: url.href,
  } as unknown as Request;
  return { url, request, sameOrigin: (init.origin ?? ORIGIN) === ORIGIN };
}

const OFFLINE = ['/', '/shopper'];

/** `RuntimeCaching.matcher` may also be a string or RegExp; ours are all functions. */
function matches(route: RuntimeCaching, options: ReturnType<typeof match>): boolean {
  return typeof route.matcher === 'function' && Boolean(route.matcher(options as never));
}

describe('service worker route classification', () => {
  it('offline-shells claims only manifest-declared offline routes, exactly', () => {
    expect(isOfflineShellRequest(match('/shopper'), OFFLINE)).toBe(true);
    expect(isOfflineShellRequest(match('/'), OFFLINE)).toBe(true);
    expect(isOfflineShellRequest(match('/shopper/list/1'), OFFLINE)).toBe(false);
    expect(isOfflineShellRequest(match('/console'), OFFLINE)).toBe(false);
    expect(
      isOfflineShellRequest(match('/shopper', { origin: 'https://other.example' }), OFFLINE),
    ).toBe(false);
  });

  it('gated pages are every other same-origin navigation, never API or cross-origin', () => {
    expect(isGatedPageNavigation(match('/console'), OFFLINE)).toBe(true);
    expect(isGatedPageNavigation(match('/account/profile'), OFFLINE)).toBe(true);
    expect(isGatedPageNavigation(match('/shopper'), OFFLINE)).toBe(false);
    expect(isGatedPageNavigation(match('/api/manifest'), OFFLINE)).toBe(false);
    expect(
      isGatedPageNavigation(match('/console', { origin: 'https://other.example' }), OFFLINE),
    ).toBe(false);
  });

  it('gated pages claims navigations only — subresource and RSC fetches pass through', () => {
    expect(
      isGatedPageNavigation(match('/console', { mode: 'cors', destination: '' }), OFFLINE),
    ).toBe(false);
    expect(
      isGatedPageNavigation(match('/console?_rsc=abc', { mode: 'cors', destination: '' }), OFFLINE),
    ).toBe(false);
  });

  it('fails toward the safe path: with no offline routes, even / is a gated page', () => {
    expect(isOfflineShellRequest(match('/'), [])).toBe(false);
    expect(isGatedPageNavigation(match('/'), [])).toBe(true);
  });

  it('the /offline fallback stands in for document requests only', () => {
    expect(isDocumentRequest(match('/console'))).toBe(true);
    expect(isDocumentRequest(match('/console', { mode: 'cors', destination: 'script' }))).toBe(
      false,
    );
  });
});

describe('service worker route handlers', () => {
  const routes = createRuntimeCaching(OFFLINE);

  it('registers offline-shells before the gated-page route so it wins for those paths', () => {
    const shells = routes.findIndex((r) => matches(r, match('/shopper')));
    const pages = routes.findIndex((r) => matches(r, match('/console')));
    expect(shells).toBeGreaterThanOrEqual(0);
    expect(pages).toBeGreaterThan(shells);
  });

  it('the gated-page route is NetworkOnly — no cache exists for it to write', () => {
    const pages = routes.find((r) => matches(r, match('/console')));
    expect(pages?.handler).toBeInstanceOf(NetworkOnly);
  });

  it('offline shells are StaleWhileRevalidate in their own cache; static assets CacheFirst', () => {
    const shells = routes.find((r) => matches(r, match('/shopper')));
    expect(shells?.handler).toBeInstanceOf(StaleWhileRevalidate);
    expect((shells?.handler as StaleWhileRevalidate).cacheName).toBe('offline-shells');

    const asset = routes.find((r) =>
      matches(r, match('/_next/static/chunks/app.js', { mode: 'no-cors', destination: 'script' })),
    );
    expect(asset?.handler).toBeInstanceOf(CacheFirst);
  });

  it('the installed table is built from the generated registry', () => {
    expect(runtimeCaching).toHaveLength(3);
  });
});
