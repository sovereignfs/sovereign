/**
 * Every outbound `fetch` in a server render path must be bounded (see
 * CLAUDE.md, "Runtime, boot, Docker") — Console's page loaders self-fetch the
 * runtime and auth admin APIs, and a hung upstream previously blocked the
 * whole page indefinitely with a blank main column. Generous enough for a
 * large user directory on a slow host, short enough that `loading.tsx` is
 * replaced by the page's own empty/error state rather than nothing.
 */
export const RENDER_FETCH_TIMEOUT_MS = 10_000;

/** A fresh timeout signal per request — an `AbortSignal` is single-use. */
export function renderFetchSignal(): AbortSignal {
  return AbortSignal.timeout(RENDER_FETCH_TIMEOUT_MS);
}
