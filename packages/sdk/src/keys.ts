/**
 * `@sovereignfs/sdk/keys` — the app key in an app's pages (sdk §9.2, RFC 0005 §4 steps 1 and 5, §5). Browser only: the one entry of the
 * SDK a page imports. The root stays server-only.
 *
 * - `open()` gives the app key while this browser holds it for the app's session, or says it is locked.
 * - `unlock()` sends the person to core's key release; core sends them back to the app's key return address.
 * - `receive()`, on the page at that address, takes core's answer from the fragment (removed from the address before anything else),
 *   opens it with the private key made for the request, checks it, and keeps the app key until the app's session ends.
 *
 * The app key is kept as core keeps the account key: wrapped by a device key and by the app session's own secret, which the app's
 * server holds (`/auth/key-secret`) and deletes with the session. Nothing of a release is in any request to a server.
 */
import {
  fromBase64Url,
  generateReceivingKey,
  importWrappingKey,
  indexedDbBackend,
  KeyStore,
  newReleaseState,
  openRelease,
  publicKeyBytes,
  ReleaseError,
  toBase64Url,
  type KeyStoreBackend,
  type ReleaseRefusal,
  type WebKey,
} from '@sovereignfs/crypto/web';

export type { ReleaseRefusal } from '@sovereignfs/crypto/web';

export type AppKeysOptions = {
  /** Core's address, the instance's: `https://id.example.com`. */
  core: string;
  /** The app's client id. */
  clientId: string;
  /** The app's key return address, exactly as registered with core (`encryption.return` in the manifest, made absolute). */
  returnTo: string;
  /** Where the app's server answers with the session's key secret. `/auth/key-secret` unless changed. */
  secretPath?: string;
  /** For tests: where things are kept, the network, the address bar and the clock. */
  backend?: KeyStoreBackend;
  fetch?: typeof fetch;
  location?: Pick<Location, 'hash' | 'pathname' | 'search' | 'assign'>;
  history?: Pick<History, 'replaceState'>;
  now?: () => number;
};

/** What `open()` found: the app key, or a browser that must be unlocked first (show `LockedState`, with `unlock()` as its action). */
export type Opened =
  { readonly state: 'open'; readonly key: WebKey } | { readonly state: 'locked' };

/** What `receive()` came to. `returnPath` is where the person was when `unlock()` was called. */
export type Received =
  | { readonly ok: true; readonly returnPath: string }
  | {
      readonly ok: false;
      readonly reason: ReleaseRefusal | 'no-answer' | 'no-request' | 'no-session';
    };

/** A request is answered within this, or it is dropped. */
const PENDING_MS = 10 * 60 * 1000;
const PENDING = (state: string) => `pending:${state}`;
const SIGNER = (sub: string) => `signer:${sub}`;

interface Pending {
  readonly privateKey: WebKey;
  readonly publicKey: Uint8Array;
  readonly at: number;
  readonly returnPath: string;
}

/** A path on the app and nothing else. */
const localPath = (value: string | undefined): string =>
  value && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') ? value : '/';

export function appKeys(options: AppKeysOptions) {
  const backend = options.backend ?? indexedDbBackend('sovereign-app-keys');
  const store = new KeyStore(backend);
  const http = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const where = () => options.location ?? globalThis.location;
  const now = options.now ?? Date.now;
  const core = options.core.replace(/\/+$/, '');

  /** The session's secret and whose session it is, from the app's own server, or `undefined` with no session. */
  async function sessionSecret(): Promise<{ sub: string; secret: Uint8Array } | undefined> {
    const response = await http(options.secretPath ?? '/auth/key-secret', {
      credentials: 'same-origin',
      cache: 'no-store',
    });
    if (!response.ok) return undefined;
    const body = (await response.json()) as { sub?: unknown; secret?: unknown };
    const secret = typeof body.secret === 'string' ? fromBase64Url(body.secret) : undefined;
    if (typeof body.sub !== 'string' || secret?.length !== 32) return undefined;
    return { sub: body.sub, secret };
  }

  return {
    /** The app key, while this browser holds it for this session. With no session, what it kept is forgotten. */
    async open(): Promise<Opened> {
      const session = await sessionSecret();
      if (!session) {
        await store.forget();
        return { state: 'locked' };
      }
      const bytes = await store.open(session.secret);
      if (!bytes) return { state: 'locked' };
      try {
        return { state: 'open', key: await importWrappingKey(bytes) };
      } finally {
        bytes.fill(0);
      }
    },

    /** Sends the person to core's key release. `returnPath` is where `receive()` says to go back to; the current page unless given. */
    async unlock(returnPath?: string): Promise<void> {
      const pair = await generateReceivingKey();
      const state = newReleaseState();
      const here = where();
      const pending: Pending = {
        privateKey: pair.privateKey,
        publicKey: await publicKeyBytes(pair.publicKey),
        at: now(),
        returnPath: localPath(returnPath ?? `${here.pathname}${here.search}`),
      };
      await backend.set(PENDING(state), pending);
      const query = new URLSearchParams({
        client_id: options.clientId,
        return_to: options.returnTo,
        request: toBase64Url(pending.publicKey),
        state,
      });
      here.assign(`${core}/keys/release?${query.toString()}`);
    },

    /** On the key return page: takes core's answer, checks it (RFC 0005 §4 step 5), and keeps the app key. */
    async receive(): Promise<Received> {
      const here = where();
      const fragment = new URLSearchParams(here.hash.replace(/^#/, ''));
      // Out of the address before anything else: history, a reload, a shared link, a script that reads it.
      (options.history ?? globalThis.history).replaceState(
        null,
        '',
        `${here.pathname}${here.search}`,
      );
      const key = fragment.get('sv_key');
      const sig = fragment.get('sv_sig');
      const state = fragment.get('state');
      if (!key || !sig || !state) return { ok: false, reason: 'no-answer' };

      // One use: the request is taken and deleted whatever comes next. A page that did not ask holds none.
      const pending = (await backend.get(PENDING(state))) as Pending | undefined;
      await backend.delete(PENDING(state));
      if (!pending || now() - pending.at > PENDING_MS) return { ok: false, reason: 'no-request' };

      const session = await sessionSecret();
      if (!session) return { ok: false, reason: 'no-session' };
      const remembered = (await backend.get(SIGNER(session.sub))) as string | undefined;
      try {
        const opened = await openRelease({
          answer: { key, sig },
          target: { clientId: options.clientId, returnTo: options.returnTo, state },
          recipient: { privateKey: pending.privateKey, publicKey: pending.publicKey },
          sub: session.sub,
          signingPublic: remembered,
          now: now(),
        });
        try {
          if (!remembered) await backend.set(SIGNER(session.sub), opened.signingPublic);
          await store.keep(opened.appKey, session.secret);
        } finally {
          opened.appKey.fill(0);
        }
        return { ok: true, returnPath: pending.returnPath };
      } catch (error) {
        if (error instanceof ReleaseError) return { ok: false, reason: error.reason };
        throw error;
      }
    },

    /** Forgets the kept app key: signing out of the app. */
    forget: () => store.forget(),
  };
}

export type AppKeys = ReturnType<typeof appKeys>;
