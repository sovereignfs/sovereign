/**
 * Browser-only, plugin-scoped mutation queue backing offline writes for
 * offline-capable plugins (RFC 0078, building on `./offline.ts`'s read-only
 * cache from RFC 0074). A plugin enqueues an intended write while offline
 * (or optimistically, even online), applies it to its own local view
 * immediately, and later drains the queue against its own sync endpoint
 * once connectivity returns.
 *
 * **Deliberately a separate IndexedDB database from `./offline.ts`'s
 * `sovereign-offline` read cache** — that module's own doc comment scopes
 * it to "no server sync, no conflict resolution"; changing that meaning
 * risks the already-shipped, already-relied-on read cache. The
 * epoch/`BroadcastChannel`/pending-purge-retry guard below is duplicated
 * from `offline.ts`, not extracted into a shared helper — a deliberate
 * lower-risk-over-DRY tradeoff for a first pass (a candidate follow-up
 * cleanup once both modules are stable, not before).
 *
 * **v1 sync model is plugin-driven, not platform-orchestrated.** There is
 * no Background Sync API usage — it has no iOS Safari support, so a
 * generic auto-scheduling helper here would be a false promise on the
 * platform that matters most for a PWA. A plugin calls `drainQueue()`
 * itself: typically on mount of its offline shell, on a `window`
 * `'online'` event, and via an explicit "Retry" affordance. If the app
 * isn't foregrounded when connectivity returns, sync doesn't happen until
 * it is.
 *
 * **Idempotent, absolute apply contract** (RFC 0078 §4): every operation a
 * plugin enqueues must describe an absolute end state, not a delta or a
 * toggle, so a retried sync request is always safe to resend verbatim. See
 * `docs/plugin-development.md`'s `offline` section for the full contract
 * plugin authors must implement server-side (client-minted permanent ids
 * for creates, last-write-wins via a server-side timestamp comparison on
 * every apply attempt, absolute-state mutations rather than toggles).
 */

const DB_NAME = 'sovereign-offline-queue';
const DB_VERSION = 1;
const STORE_NAME = 'queue';

/**
 * Soft cap on queued-but-unsynced mutations per plugin. Unlike
 * `offline.ts`'s byte-size cap on cached read values, this is
 * **count-based** — queue entries are small, numerous operations, not large
 * blobs. There is no eviction: silently dropping a queued *write* is data
 * loss, not inconvenience, so exceeding this throws rather than silently
 * discarding the oldest/newest entry.
 */
const MAX_QUEUE_ENTRIES_PER_PLUGIN = 500;

/** Thrown by `enqueue` once a plugin's queue is at {@link MAX_QUEUE_ENTRIES_PER_PLUGIN}. */
export class OfflineQueueFullError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OfflineQueueFullError';
  }
}

/** A single queued write, as seen by the plugin and sent to its sync endpoint. */
export interface QueuedMutation<TPayload = unknown> {
  /**
   * Client-generated idempotency key. Send verbatim on every sync
   * attempt/retry — the server must treat a repeat of the same id as a
   * no-op re-apply of an already-applied mutation, never a new one.
   */
  id: string;
  /** Plugin-defined operation name, e.g. `'addItem'`, `'setBought'`. */
  op: string;
  payload: TPayload;
  /**
   * Epoch **seconds** — match whatever timestamp convention your own
   * database uses, since this value is what a server-side last-write-wins
   * comparison checks against a row's own timestamp column.
   */
  clientTimestamp: number;
  /** Incremented by `drainQueue` each time this mutation's sync attempt fails. */
  attempts: number;
  /** The most recent sync failure reason, if any. */
  lastError?: string;
}

/** On-disk record: a {@link QueuedMutation} plus the monotonic sequence this
 *  module uses to preserve enqueue order — never sent to a sync endpoint. */
interface StoredMutation<TPayload = unknown> extends QueuedMutation<TPayload> {
  seq: number;
}

/** See `offline.ts`'s identical helper for why array keys, not a delimited string. */
function compositeKey(pluginId: string, mutationId: string): [string, string] {
  return [pluginId, mutationId];
}

/** See `offline.ts`'s identical helper — an exact, delimiter-free `[pluginId, *]` range. */
function pluginKeyRange(pluginId: string): IDBKeyRange {
  return IDBKeyRange.bound([pluginId], [pluginId, []], false, true);
}

function openDb(): Promise<IDBDatabase> {
  ensureTabState();
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB.'));
  });
}

/** Bumped by `clearAll` — see `offline.ts`'s identical epoch guard for the full rationale. */
let epoch = 0;
const CLEAR_CHANNEL_NAME = 'sovereign-offline-queue-clear';
let clearChannel: BroadcastChannel | null = null;
const PENDING_PURGE_KEY = 'sovereign:offline-queue-purge-pending';

function markPurgePending(): void {
  try {
    localStorage.setItem(PENDING_PURGE_KEY, '1');
  } catch {
    // best-effort — e.g. localStorage disabled/full; nothing further to do.
  }
}

function clearPurgePending(): void {
  try {
    localStorage.removeItem(PENDING_PURGE_KEY);
  } catch {
    // best-effort, see markPurgePending.
  }
}

function hasPurgePending(): boolean {
  try {
    return localStorage.getItem(PENDING_PURGE_KEY) === '1';
  } catch {
    return false;
  }
}

let pendingPurgeChecked = false;

/** Runs once per tab on first use — see `offline.ts`'s identical helper. */
function ensureTabState(): void {
  if (typeof BroadcastChannel !== 'undefined' && !clearChannel) {
    clearChannel = new BroadcastChannel(CLEAR_CHANNEL_NAME);
    clearChannel.onmessage = () => {
      epoch++;
    };
  }
  if (!pendingPurgeChecked) {
    pendingPurgeChecked = true;
    if (hasPurgePending()) {
      void offlineQueue.clearAll();
    }
  }
}

/**
 * Per-tab monotonic counter seeded from `Date.now()`, bumped on every
 * `enqueue` so two mutations created within the same millisecond still sort
 * correctly. Only needs to avoid collisions within one tab's lifetime — each
 * entry's own `seq` is written once, at enqueue time, and persisted with it,
 * so a reload never reorders anything already queued.
 */
let seqCounter = Date.now();
function nextSeq(): number {
  return ++seqCounter;
}

function generateMutationId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID.
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function countForPlugin(db: IDBDatabase, pluginId: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).count(pluginKeyRange(pluginId));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('Failed to count offline mutations.'));
  });
}

/** Strip the internal `seq` field before handing a record back to a caller. */
function toPublic<TPayload>(stored: StoredMutation<TPayload>): QueuedMutation<TPayload> {
  const { seq: _seq, ...mutation } = stored;
  return mutation;
}

/** Plugin-scoped offline mutation queue (RFC 0078). Browser-only — import from `@sovereignfs/sdk/offline-queue`. */
export const offlineQueue = {
  /**
   * Queue a write for later sync. Applies no timestamp/state validation of
   * its own — callers are responsible for applying the mutation optimistically
   * to their own local view (e.g. via `offline.set()`) alongside this call.
   * @throws {OfflineQueueFullError} once the plugin's queue is at {@link MAX_QUEUE_ENTRIES_PER_PLUGIN}.
   */
  async enqueue<TPayload>(
    pluginId: string,
    op: string,
    payload: TPayload,
  ): Promise<QueuedMutation<TPayload>> {
    const writeEpoch = epoch;
    const db = await openDb();
    const current = await countForPlugin(db, pluginId);
    if (current >= MAX_QUEUE_ENTRIES_PER_PLUGIN) {
      db.close();
      throw new OfflineQueueFullError(
        `offlineQueue.enqueue: plugin "${pluginId}" already has ${MAX_QUEUE_ENTRIES_PER_PLUGIN} queued ` +
          `mutations — drain (sync) the queue before adding more.`,
      );
    }
    const mutation: StoredMutation<TPayload> = {
      id: generateMutationId(),
      op,
      payload,
      clientTimestamp: Math.floor(Date.now() / 1000),
      attempts: 0,
      seq: nextSeq(),
    };
    await new Promise<void>((resolve, reject) => {
      if (writeEpoch !== epoch) {
        // A clearAll() ran while this write was in flight — don't let it
        // resurrect a mutation belonging to the session that was purged.
        resolve();
        return;
      }
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(mutation, compositeKey(pluginId, mutation.id));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Failed to enqueue offline mutation.'));
    });
    db.close();
    return toPublic(mutation);
  },

  /** List this plugin's queued mutations, oldest first (enqueue order). */
  async list<TPayload = unknown>(pluginId: string): Promise<QueuedMutation<TPayload>[]> {
    const db = await openDb();
    const stored = await new Promise<StoredMutation<TPayload>[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).getAll(pluginKeyRange(pluginId));
      request.onsuccess = () => resolve(request.result as StoredMutation<TPayload>[]);
      request.onerror = () =>
        reject(request.error ?? new Error('Failed to list offline mutations.'));
    });
    db.close();
    return stored.sort((a, b) => a.seq - b.seq).map(toPublic);
  },

  /** Remove one queued mutation (e.g. after it's been applied). No-op if it's already gone. */
  async remove(pluginId: string, mutationId: string): Promise<void> {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(compositeKey(pluginId, mutationId));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Failed to remove offline mutation.'));
    });
    db.close();
  },

  /** Record a failed sync attempt (increments `attempts`, sets `lastError`) without removing it. */
  async markFailed(pluginId: string, mutationId: string, error: string): Promise<void> {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(compositeKey(pluginId, mutationId));
      getReq.onsuccess = () => {
        const existing = getReq.result as StoredMutation | undefined;
        if (!existing) return;
        existing.attempts += 1;
        existing.lastError = error;
        store.put(existing, compositeKey(pluginId, mutationId));
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Failed to update offline mutation.'));
    });
    db.close();
  },

  /** Remove every queued mutation for this plugin. */
  async clear(pluginId: string): Promise<void> {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(pluginKeyRange(pluginId));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Failed to clear offline queue.'));
    });
    db.close();
  },

  /**
   * Remove every queued mutation for every plugin, in this tab and every
   * other open tab (via `BroadcastChannel`). Called on every logout/login
   * boundary alongside `offline.clearAll()` (RFC 0078 §6/§7) — purging the
   * write queue is destructive to any not-yet-synced edit, so callers
   * should attempt a best-effort `drainQueue()` first when online; this
   * method itself always purges unconditionally, the same way
   * `offline.clearAll()` does.
   */
  async clearAll(): Promise<void> {
    ensureTabState();
    epoch++;
    clearChannel?.postMessage('clear');
    markPurgePending();
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Failed to clear offline queue.'));
    });
    db.close();
    clearPurgePending();
  },
};

/** The result of attempting to sync one queued mutation. */
export interface SyncOutcome {
  id: string;
  status: 'applied' | 'skipped' | 'failed';
  error?: string;
}

/**
 * Pure grouping of a sync batch's outcomes by status — no IndexedDB access.
 * Exported and separately unit-testable; `drainQueue` uses it to decide
 * which mutations to remove vs. mark failed, but a plugin summarizing its
 * own sync results in UI can reuse it too.
 */
export function categorizeOutcomes(outcomes: SyncOutcome[]): {
  applied: string[];
  skipped: string[];
  failed: { id: string; error: string }[];
} {
  const applied: string[] = [];
  const skipped: string[] = [];
  const failed: { id: string; error: string }[] = [];
  for (const outcome of outcomes) {
    if (outcome.status === 'applied') applied.push(outcome.id);
    else if (outcome.status === 'skipped') skipped.push(outcome.id);
    else failed.push({ id: outcome.id, error: outcome.error ?? 'sync failed' });
  }
  return { applied, skipped, failed };
}

/**
 * Drains one plugin's queue against a plugin-supplied applier. Lists the
 * full pending batch (oldest first) and calls `applyBatch` once with it —
 * the plugin's own sync endpoint is expected to apply sequentially
 * server-side and halt at the first failure (RFC 0078 §4), preserving
 * causal order (e.g. an edit to an item must not be attempted before that
 * item's own `addItem` has applied) without a dependency graph. Every
 * `applied`/`skipped` outcome removes that mutation from the local queue;
 * every `failed` outcome records the attempt/error via `markFailed` and
 * leaves it queued for the next drain.
 *
 * Pure on-demand primitive — no listener, no timer, no auto-retry. The
 * plugin decides when to call this; see the module doc comment for why
 * there's no platform-orchestrated background sync.
 */
export async function drainQueue<TPayload = unknown>(
  pluginId: string,
  applyBatch: (batch: QueuedMutation<TPayload>[]) => Promise<SyncOutcome[]>,
): Promise<{ applied: string[]; skipped: string[]; failed: { id: string; error: string }[] }> {
  const batch = await offlineQueue.list<TPayload>(pluginId);
  if (batch.length === 0) return { applied: [], skipped: [], failed: [] };

  const outcomes = await applyBatch(batch);
  const result = categorizeOutcomes(outcomes);

  for (const id of [...result.applied, ...result.skipped]) {
    await offlineQueue.remove(pluginId, id);
  }
  for (const { id, error } of result.failed) {
    await offlineQueue.markFailed(pluginId, id, error);
  }

  return result;
}
