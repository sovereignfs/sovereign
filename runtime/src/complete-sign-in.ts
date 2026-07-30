import { offline } from '@sovereignfs/sdk/offline';
import { offlineQueue } from '@sovereignfs/sdk/offline-queue';

/**
 * Call after any successful authentication (password, passkey, 2FA
 * verification, or registration) right before navigating into the app.
 *
 * Purges every plugin's offline read cache (RFC 0074) and mutation queue
 * (RFC 0078) first. `AccountMenu`'s sign out already does this on the way
 * out, but that alone only covers a session that ends via that one explicit
 * button — a session can also end by simply expiring, or by the browser tab
 * being closed without a formal sign-out, leaving a previous user's cached
 * Wallet/Shopper data (and any of their still-unsynced offline edits)
 * sitting in IndexedDB for whoever logs in next on the same device. Purging
 * on every *new* session's first successful authentication closes that gap
 * regardless of how the previous one ended.
 *
 * Deliberately **no** best-effort drain attempt here, unlike the sign-out
 * path (`AccountMenu.tsx`) — draining would mean syncing the *previous*
 * user's queued writes using the *new* user's just-established session,
 * misattributing (or simply failing to authenticate) their edits. Any
 * unsynced work from a session that ended without an explicit sign-out is
 * unrecoverable by construction; purging it here is what keeps the next
 * user's device clean, not an attempt to save it.
 *
 * Best-effort: navigates into the app either way, even if the purge fails
 * (IndexedDB unavailable, etc.) — a stale cache is not worth blocking sign-in
 * over.
 */
export async function completeSignIn(): Promise<void> {
  try {
    await Promise.all([offline.clearAll(), offlineQueue.clearAll()]);
  } finally {
    window.location.href = '/';
  }
}
