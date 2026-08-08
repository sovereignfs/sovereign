/**
 * Browser half of the offline session assertion (research 0012, epic task
 * 1.21) — runs in the page, not the service worker.
 *
 * While online, fetches the signed assertion and the public JWKS and writes
 * both to IndexedDB, where `runtime/worker/offline-session.ts` reads them with
 * no network. On sign-out, clears them and tells the worker to drop that user's
 * cached documents.
 *
 * Both requests go through the runtime's own `/api/auth/*` proxy rather than
 * the auth origin directly: SameSite=Lax cookies are not sent on cross-origin
 * fetches, and iOS PWA standalone mode breaks out to Safari on cross-origin
 * redirects. The proxy is also why no `NEXT_PUBLIC_*` auth URL is needed —
 * which matters, because Next.js inlines those at build time and Docker images
 * build without `.env`.
 *
 * Every failure here is non-fatal and silent by design. Losing the assertion
 * costs offline reach on the next launch; it never blocks the online app, and
 * a user who cannot reach the network to refresh it is precisely the user who
 * must not be interrupted by an error.
 */

const DB_NAME = 'sovereign-offline-session';
const DB_VERSION = 1;
const STORE = 'session';
const ASSERTION_KEY = 'assertion';
const JWKS_KEY = 'jwks';

interface OfflineSessionResponse {
  token: string | null;
  expiresInSeconds: number;
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      request.onerror = () => resolve(null);
      request.onsuccess = () => resolve(request.result);
    } catch {
      // Private browsing and some embedded webviews reject indexedDB.open
      // outright rather than firing onerror.
      resolve(null);
    }
  });
}

async function idbWrite(entries: Array<[string, unknown]>): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      for (const [key, value] of entries) store.put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
  db.close();
}

async function idbClear(): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
  db.close();
}

/**
 * Refresh the stored assertion and JWKS. Safe to call on every page load —
 * it is a single conditional round-trip and the worker only reads what it
 * finds.
 *
 * The JWKS is re-fetched alongside the assertion rather than cached
 * indefinitely so that key rotation propagates: a device holding only a
 * retired public key would fail verification for every assertion signed with
 * the new one, silently losing offline access until the next fetch.
 */
export async function refreshOfflineSession(): Promise<void> {
  try {
    const [assertionRes, jwksRes] = await Promise.all([
      fetch('/api/auth/offline-session', { credentials: 'same-origin' }),
      fetch('/api/auth/jwks', { credentials: 'same-origin' }),
    ]);
    if (!assertionRes.ok || !jwksRes.ok) return;

    const assertion = (await assertionRes.json()) as OfflineSessionResponse;
    const jwks = (await jwksRes.json()) as { keys?: unknown[] };
    if (!assertion?.token || !Array.isArray(jwks?.keys) || jwks.keys.length === 0) return;

    await idbWrite([
      [ASSERTION_KEY, assertion.token],
      [JWKS_KEY, jwks],
    ]);
  } catch {
    // Offline, or auth unreachable — keep whatever is already stored. It is
    // still signed and still carries its own expiry, so a stale copy is safe.
  }
}

/**
 * Clear the assertion and drop this user's cached documents.
 *
 * Called before the sign-out request completes, deliberately: once the session
 * cookie is gone the page may navigate away before any later cleanup runs.
 * Awaiting this is cheap and it must not be skipped — a stale assertion left
 * behind is what would let the next user on a shared device be served the
 * previous user's cached shell.
 */
export async function clearOfflineSession(userId: string | null): Promise<void> {
  await idbClear();
  if (!userId) return;
  try {
    const registration = await navigator.serviceWorker?.ready;
    registration?.active?.postMessage({ type: 'sovereign:sign-out', userId });
  } catch {
    // No worker registered (dev, unsupported browser) — the assertion is
    // already gone, so nothing can select that partition on the next launch.
  }
}
