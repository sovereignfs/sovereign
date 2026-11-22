/** What a page sends a waiting service worker to have it take over (RFC 0001 A3). The worker accepts no other message. */
export const TAKE_OVER_MESSAGE = 'sv-take-over';

/** What the worker posts to the app's open pages for a Background Sync, as `{ type, tag }`, unless the app names its own message. */
export const SYNC_MESSAGE = 'sv-sync';
