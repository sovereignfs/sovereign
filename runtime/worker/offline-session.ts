/// <reference lib="webworker" />
/**
 * Service-worker half of manifest-declared offline route detection (research
 * 0012, epic task 3.36).
 *
 * Exposes which paths are offline-capable (neutral) shells as a global the
 * generated Workbox service worker can call from its `runtimeCaching`
 * matchers.
 *
 * ## Why a global rather than an import
 *
 * `workboxOptions.runtimeCaching[].urlPattern` functions are **stringified**
 * into the generated `sw.js` by workbox-build. A function there cannot close
 * over an imported module — it must be self-contained. This file, by contrast,
 * is bundled properly (`customWorkerSrc`) and `importScripts`-ed at the top of
 * the generated worker, before any `fetch` event can run. So the real logic
 * lives here and `next.config.ts` carries only a one-line delegation.
 *
 * ## History
 *
 * This file previously also verified a signed per-user offline session
 * assertion and derived a per-user cache-partition key from it (research
 * 0012, epic tasks 1.21/2.31/2.32) — removed after live testing found the
 * client-side half that populated the assertion (`refreshOfflineSession()`,
 * formerly `runtime/src/offline-session-client.ts`) was never actually
 * wired into the app, so the assertion never existed and the check it fed
 * was dead weight. Worse, the gap it was meant to close (`/` replaying a
 * signed-out user's cached shell) was never routed through it at all — see
 * `runtime/next.config.ts`'s comment above `runtimeCaching` for the fix.
 * `runtime/src/offline-session.ts` (the pure-logic mirror), the signing
 * endpoint (`apps/auth/src/offline-session.ts`), and
 * `/offline/session-required` were removed alongside it.
 */

import { getOfflineRoutePrefixes } from '../src/registry';

declare const self: ServiceWorkerGlobalScope;

/**
 * Manifest-declared offline-capable route prefixes (RFC 0078), e.g.
 * "/shopper" — resolved once at worker-script load time from the generated
 * registry. This file is a real bundled module (`customWorkerSrc`), so
 * importing it here is safe; `next.config.ts`'s `runtimeCaching` matcher
 * functions are not (see the file header above) — they are
 * `Function.prototype.toString()`-serialized into the generated `sw.js` by
 * workbox-build, which drops every closure, including references to a
 * same-file top-level `const`. Exposed below as `self.__sovereignIsOfflineRoute`
 * so those matchers can read it as a global instead.
 */
const offlineRoutePrefixes = getOfflineRoutePrefixes();

function isOfflineRoute(pathname: string): boolean {
  return offlineRoutePrefixes.includes(pathname);
}

interface SovereignWorkerGlobals {
  __sovereignIsOfflineRoute: (pathname: string) => boolean;
}

const globals = self as unknown as SovereignWorkerGlobals;
globals.__sovereignIsOfflineRoute = isOfflineRoute;

export {};
