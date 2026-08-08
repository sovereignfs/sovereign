/// <reference lib="webworker" />
/**
 * Service-worker half of the offline session assertion (research 0012, epic
 * tasks 1.21 + 2.31).
 *
 * Reads the signed assertion and the cached JWKS that the page stored in
 * IndexedDB while online, verifies the signature with WebCrypto, and exposes
 * the resulting cache-partition key as a global the generated Workbox service
 * worker can call from its `cacheKeyWillBeUsed` hook.
 *
 * ## Why a global rather than an import
 *
 * `workboxOptions.runtimeCaching[].options.plugins` entries are **stringified**
 * into the generated `sw.js` by workbox-build. A function there cannot close
 * over an imported module — it must be self-contained. This file, by contrast,
 * is bundled properly (`customWorkerSrc`) and `importScripts`-ed at the top of
 * the generated worker, before any `fetch` event can run. So the real logic
 * lives here and `next.config.ts` carries only a one-line delegation.
 *
 * ## Fails closed
 *
 * Every failure path — no assertion, no JWKS, bad signature, expired, storage
 * unavailable — yields the anonymous partition, never the bare URL. An
 * unidentified request therefore gets a cache miss and goes to network; it can
 * never collide with, and be served, a real user's cached document.
 */

declare const self: ServiceWorkerGlobalScope;

const DB_NAME = 'sovereign-offline-session';
const STORE = 'session';
const ASSERTION_KEY = 'assertion';
const JWKS_KEY = 'jwks';

/** JWT `typ` the auth server stamps on an offline assertion. */
const OFFLINE_ASSERTION_TYPE = 'sovereign-offline-session+jwt';
/** Cache-key partition used when no user could be established. */
const ANONYMOUS_PARTITION = 'anon';

/**
 * Verifying on every single request would mean an IndexedDB read plus an
 * asymmetric signature check per navigation and per subresource. The result
 * only changes on sign-in, sign-out, or expiry, so it is memoised briefly.
 * Short enough that a sign-out takes effect promptly; long enough that a page
 * load does not re-verify dozens of times.
 */
const MEMO_MS = 5_000;
let memo: { userId: string | null; atMs: number } | null = null;

interface StoredJwks {
  keys: JsonWebKey[];
}

function idbGet<T>(key: string): Promise<T | null> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (value: T | null) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    try {
      const open = indexedDB.open(DB_NAME, 1);
      // The page owns schema creation. If the SW opens first and the store is
      // absent, resolve null rather than creating a half-formed database.
      open.onupgradeneeded = () => {
        const db = open.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      open.onerror = () => done(null);
      open.onsuccess = () => {
        const db = open.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.close();
          return done(null);
        }
        const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
        req.onerror = () => {
          db.close();
          done(null);
        };
        req.onsuccess = () => {
          const value = (req.result ?? null) as T | null;
          db.close();
          done(value);
        };
      };
    } catch {
      done(null);
    }
  });
}

function base64UrlToBytes(input: string): Uint8Array {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function decodeJson(segment: string): Record<string, unknown> | null {
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlToBytes(segment))) as Record<
      string,
      unknown
    >;
  } catch {
    return null;
  }
}

/**
 * Map a JWS `alg` to its WebCrypto import/verify parameters. Only the
 * algorithms better-auth's `jwt()` plugin can issue are accepted; an unknown
 * or absent `alg` returns null so verification fails closed rather than
 * silently trying a weaker interpretation.
 *
 * `none` is unreachable here by construction — it is not in this table — which
 * is the whole point of allow-listing rather than trusting the header.
 */
function algorithmFor(alg: unknown): {
  importParams: AlgorithmIdentifier | EcKeyImportParams | RsaHashedImportParams;
  verifyParams: AlgorithmIdentifier | EcdsaParams;
} | null {
  switch (alg) {
    case 'EdDSA':
    case 'Ed25519':
      return { importParams: { name: 'Ed25519' }, verifyParams: { name: 'Ed25519' } };
    case 'ES256':
      return {
        importParams: { name: 'ECDSA', namedCurve: 'P-256' },
        verifyParams: { name: 'ECDSA', hash: 'SHA-256' },
      };
    case 'RS256':
      return {
        importParams: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        verifyParams: { name: 'RSASSA-PKCS1-v1_5' },
      };
    default:
      return null;
  }
}

/**
 * Verify the stored assertion and return the user id it names, or null.
 *
 * Mirrors `runtime/src/offline-session.ts`'s `userFromAssertionClaims` for the
 * claim rules — that module is the unit-tested source of truth for them; this
 * adds the signature check that cannot run outside a crypto-capable context.
 */
async function verifyStoredAssertion(): Promise<string | null> {
  const token = await idbGet<string>(ASSERTION_KEY);
  const jwks = await idbGet<StoredJwks>(JWKS_KEY);
  if (typeof token !== 'string' || !jwks?.keys?.length) return null;

  const [headerSegment, payloadSegment, signatureSegment] = token.split('.');
  if (!headerSegment || !payloadSegment || !signatureSegment) return null;

  const header = decodeJson(headerSegment);
  const payload = decodeJson(payloadSegment);
  if (!header || !payload) return null;

  const algorithm = algorithmFor(header.alg);
  if (!algorithm) return null;

  // Match on `kid` when the header names one, so key rotation does not
  // silently verify against a retired key; fall back to trying every published
  // key when it does not.
  const kid = header.kid;
  const candidates = jwks.keys.filter(
    (key) => typeof kid !== 'string' || (key as { kid?: string }).kid === kid,
  );
  if (candidates.length === 0) return null;

  const data = new TextEncoder().encode(`${headerSegment}.${payloadSegment}`);
  const signature = base64UrlToBytes(signatureSegment);

  let verified = false;
  for (const jwk of candidates) {
    try {
      const key = await crypto.subtle.importKey('jwk', jwk, algorithm.importParams, false, [
        'verify',
      ]);
      if (await crypto.subtle.verify(algorithm.verifyParams, key, signature, data)) {
        verified = true;
        break;
      }
    } catch {
      // Unusable key (wrong type for this alg, malformed) — try the next.
    }
  }
  if (!verified) return null;

  // Signature is good. Now the claim rules — see runtime/src/offline-session.ts.
  if (payload.typ !== OFFLINE_ASSERTION_TYPE) return null;
  const sub = payload.sub;
  if (typeof sub !== 'string' || sub.length === 0) return null;
  const exp = payload.exp;
  if (typeof exp !== 'number' || !Number.isFinite(exp)) return null;
  if (exp * 1000 <= Date.now()) return null;

  return sub;
}

/** Verified user id for the current device, memoised. Null when unestablished. */
async function currentUserId(): Promise<string | null> {
  const now = Date.now();
  if (memo && now - memo.atMs < MEMO_MS) return memo.userId;
  let userId: string | null = null;
  try {
    userId = await verifyStoredAssertion();
  } catch {
    userId = null;
  }
  memo = { userId, atMs: now };
  return userId;
}

/**
 * Cache key for a document request, scoped to the verified user. Called from
 * the generated worker's `cacheKeyWillBeUsed` hook.
 */
async function partitionedCacheKey(url: string): Promise<string> {
  const userId = await currentUserId();
  const partition = userId ?? ANONYMOUS_PARTITION;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}__sv_u=${encodeURIComponent(partition)}`;
}

/**
 * Drop every cached document belonging to one user, leaving other accounts on
 * a shared device untouched. Invoked by the page on sign-out via postMessage.
 */
async function purgeUserPartition(userId: string): Promise<void> {
  memo = null;
  const marker = `__sv_u=${encodeURIComponent(userId)}`;
  const names = await caches.keys();
  await Promise.all(
    names.map(async (name) => {
      const cache = await caches.open(name);
      const requests = await cache.keys();
      await Promise.all(requests.filter((r) => r.url.includes(marker)).map((r) => cache.delete(r)));
    }),
  );
}

interface SovereignWorkerGlobals {
  __sovereignCacheKey: (url: string) => Promise<string>;
  __sovereignPurgeUser: (userId: string) => Promise<void>;
  __sovereignResetMemo: () => void;
}

const globals = self as unknown as SovereignWorkerGlobals;
globals.__sovereignCacheKey = partitionedCacheKey;
globals.__sovereignPurgeUser = purgeUserPartition;
globals.__sovereignResetMemo = () => {
  memo = null;
};

export {};
