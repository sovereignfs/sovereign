import { offline } from '@sovereignfs/sdk/offline';

/**
 * Call after any successful authentication (password, passkey, 2FA
 * verification, or registration) right before navigating into the app.
 *
 * Purges every plugin's offline cache (RFC 0072) first. `AccountMenu`'s sign
 * out already does this on the way out, but that alone only covers a
 * session that ends via that one explicit button — a session can also end
 * by simply expiring, or by the browser tab being closed without a formal
 * sign-out, leaving a previous user's cached Wallet/Shopper data sitting in
 * IndexedDB for whoever logs in next on the same device. Purging on every
 * *new* session's first successful authentication closes that gap
 * regardless of how the previous one ended.
 *
 * Best-effort: navigates into the app either way, even if the purge fails
 * (IndexedDB unavailable, etc.) — a stale cache is not worth blocking sign-in
 * over.
 */
export async function completeSignIn(): Promise<void> {
  try {
    await offline.clearAll();
  } finally {
    window.location.href = '/';
  }
}
