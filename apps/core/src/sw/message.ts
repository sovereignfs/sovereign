/**
 * What a page sends a waiting service worker to have it take over (RFC 0001 A3). Kept apart from the worker's
 * source so the page that sends it does not carry the worker's text.
 */
export const TAKE_OVER_MESSAGE = 'sv-take-over';
