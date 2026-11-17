/// <reference lib="dom" />
import { source, utf8 } from './bytes.js';
import type { WebKey } from './password.js';

/**
 * What a browser keeps so that it stays unlocked until its session ends (RFC 0005 §5, core-app §5.4): core's pages keep the account
 * key with it, and an app's pages, through `@sovereignfs/sdk/keys`, the app key. Also the one-use hand-over of a password's secret
 * across the second step of signing in, which only core's pages use.
 *
 * The account key is kept wrapped twice: by a device key that cannot be exported, kept beside it, and by a key made from the
 * session's secret, which only the server holds and deletes with the session. What is kept is therefore useless once the session has
 * ended, whether or not a page was open to see it end. The backend is IndexedDB in a browser and a map in tests.
 */

/** Where things are kept: IndexedDB, or anything with the same three calls. */
export interface KeyStoreBackend {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
}

const DEVICE = 'device';
const ACCOUNT = 'account';
const HANDOVER = 'handover';
const KEEP_INFO = utf8('sovereign/1/session-keep');
/** A hand-over lives as long as a second step can reasonably take. */
const HANDOVER_MS = 10 * 60 * 1000;

interface Kept {
  readonly inner: Uint8Array;
  readonly outer: Uint8Array;
  readonly ciphertext: Uint8Array;
}

/** A backend over one IndexedDB database of the page's origin. */
export function indexedDbBackend(name: string): KeyStoreBackend {
  let opening: Promise<IDBDatabase> | undefined;
  const database = () =>
    (opening ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('keys');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB could not be opened.'));
    }));
  const run = async <T>(
    mode: IDBTransactionMode,
    act: (store: IDBObjectStore) => IDBRequest<T>,
  ) => {
    const db = await database();
    return new Promise<T>((resolve, reject) => {
      const request = act(db.transaction('keys', mode).objectStore('keys'));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB refused.'));
    });
  };
  return {
    get: (key) => run('readonly', (store) => store.get(key)),
    set: async (key, value) => {
      await run('readwrite', (store) => store.put(value, key));
    },
    delete: async (key) => {
      await run('readwrite', (store) => store.delete(key));
    },
  };
}

/** A backend in memory, for tests and for a page that keeps nothing. */
export function memoryBackend(): KeyStoreBackend {
  const values = new Map<string, unknown>();
  return {
    get: async (key) => values.get(key),
    set: async (key, value) => {
      values.set(key, value);
    },
    delete: async (key) => {
      values.delete(key);
    },
  };
}

export class KeyStore {
  readonly #backend: KeyStoreBackend;
  readonly #now: () => number;

  constructor(backend: KeyStoreBackend, now: () => number = Date.now) {
    this.#backend = backend;
    this.#now = now;
  }

  /** The device key: made once, kept as a key that cannot be exported. */
  async #deviceKey(): Promise<WebKey> {
    const found = (await this.#backend.get(DEVICE)) as WebKey | undefined;
    if (found) return found;
    const made = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt',
    ]);
    await this.#backend.set(DEVICE, made);
    return made;
  }

  async #sessionKey(sessionSecret: Uint8Array): Promise<WebKey> {
    const material = await crypto.subtle.importKey('raw', source(sessionSecret), 'HKDF', false, [
      'deriveKey',
    ]);
    return crypto.subtle.deriveKey(
      { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(), info: source(KEEP_INFO) },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
  }

  /** Keeps the account key's bytes for this session. The caller overwrites them afterwards. */
  async keep(accountKey: Uint8Array, sessionSecret: Uint8Array): Promise<void> {
    const inner = crypto.getRandomValues(new Uint8Array(12));
    const outer = crypto.getRandomValues(new Uint8Array(12));
    const once = new Uint8Array(
      await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: inner },
        await this.#sessionKey(sessionSecret),
        source(accountKey),
      ),
    );
    const twice = new Uint8Array(
      await crypto.subtle.encrypt({ name: 'AES-GCM', iv: outer }, await this.#deviceKey(), once),
    );
    const kept: Kept = { inner, outer, ciphertext: twice };
    await this.#backend.set(ACCOUNT, kept);
  }

  /**
   * The account key's bytes, when this browser kept them for this session, or `undefined`: nothing kept, or kept for a session
   * that is not this one. The caller overwrites the bytes once it has made what it needs.
   */
  async open(sessionSecret: Uint8Array): Promise<Uint8Array | undefined> {
    const kept = (await this.#backend.get(ACCOUNT)) as Kept | undefined;
    if (!kept) return undefined;
    try {
      const once = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: source(kept.outer) },
        await this.#deviceKey(),
        source(kept.ciphertext),
      );
      return new Uint8Array(
        await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: source(kept.inner) },
          await this.#sessionKey(sessionSecret),
          once,
        ),
      );
    } catch {
      // Kept for another session, or for nothing: it will never open, so it goes.
      await this.#backend.delete(ACCOUNT);
      return undefined;
    }
  }

  /** Whether anything is kept, without opening it. */
  async holds(): Promise<boolean> {
    return (await this.#backend.get(ACCOUNT)) !== undefined;
  }

  /** Forgets what was kept: signing out, or a page that finds no session. */
  async forget(): Promise<void> {
    await this.#backend.delete(ACCOUNT);
    await this.#backend.delete(HANDOVER);
  }

  /** Hands a password's secret over the second step of signing in: kept once, taken once. */
  async handOver(secret: WebKey): Promise<void> {
    await this.#backend.set(HANDOVER, { secret, at: this.#now() });
  }

  /** Takes the hand-over, if there is one young enough, and removes it either way. */
  async takeHandOver(): Promise<WebKey | undefined> {
    const found = (await this.#backend.get(HANDOVER)) as { secret: WebKey; at: number } | undefined;
    await this.#backend.delete(HANDOVER);
    if (!found || this.#now() - found.at > HANDOVER_MS) return undefined;
    return found.secret;
  }

  /** Drops a hand-over nobody took: a sign-in page loading again starts afresh. */
  async dropHandOver(): Promise<void> {
    await this.#backend.delete(HANDOVER);
  }
}
