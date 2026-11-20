import { randomUUID } from 'node:crypto';
import { checkMessage, type PushMessage } from './message.js';
import { sendPush, type SendOutcome } from './send.js';
import type { PushSettings } from './settings.js';
import type { ClaimedPush, PushStore, QueuedPush } from './store.js';

/**
 * The outbox (RFC 0009 §1.5): a push is a row written **in the transaction of the change that raised it**, so a change rolled back
 * sends nothing, and sent by {@link runPushOutbox}, which claims rows by a lease so two processes never send one. Nothing here logs.
 */

/** How long a push is worth sending by default: a reminder late by more is no reminder. */
export const DEFAULT_PUSH_TTL_MS = 4 * 60 * 60 * 1000;
/** The pauses after a first, second and third try that did not reach the device; after a fourth it is given up. */
export const BACKOFF_MS: readonly number[] = [60_000, 5 * 60_000, 30 * 60_000];
/** How long a runner holds a push it is sending: longer than a whole batch can take, since a batch is sent at once. */
export const LEASE_MS = 60_000;
export const BATCH = 20;

export interface EnqueuePushOptions {
  readonly account: string;
  readonly message: PushMessage;
  readonly now: number;
  /** How long it is worth sending; default {@link DEFAULT_PUSH_TTL_MS}. */
  readonly ttlMs?: number;
}

/**
 * Queues a push for each of the account's devices. **Call it with the store of the transaction that made the change.** It never
 * sends, and throws `PushMessageError` for a message outside its limits, so a bad message fails the change rather than a later pass.
 * Returns how many were queued.
 */
export async function enqueuePush(store: PushStore, options: EnqueuePushOptions): Promise<number> {
  const message = checkMessage(options.message);
  const ttl = options.ttlMs ?? DEFAULT_PUSH_TTL_MS;
  if (!(ttl > 0)) throw new RangeError('ttlMs is a positive number of milliseconds');
  const devices = await store.devices(options.account);
  const items: QueuedPush[] = devices.map((device) => ({
    id: randomUUID(),
    account: options.account,
    endpoint: device.endpoint,
    message,
    dueAt: options.now,
    expiresAt: options.now + ttl,
  }));
  if (items.length > 0) await store.enqueue(items);
  return items.length;
}

export interface RunPushOutboxOptions {
  readonly store: PushStore;
  /** `undefined` (no key): nothing is sent, and the rows wait. */
  readonly settings: PushSettings | undefined;
  readonly now: number;
  readonly batch?: number;
  readonly leaseMs?: number;
  /** As for {@link sendPush}. */
  readonly hosts?: readonly string[];
  readonly timeoutMs?: number;
  readonly fetch?: typeof fetch;
}

/** What a pass did, in counts only. */
export interface OutboxPass {
  readonly sent: number;
  /** To be tried again later. */
  readonly retry: number;
  /** Given up on: refused, out of tries, or too old. */
  readonly dropped: number;
  /** Devices the push service said are gone, forgotten with their waiting pushes. */
  readonly forgotten: number;
}

/**
 * Sends what is due: one batch, claimed by a lease and sent at once. `201` is done; `404`/`410` forgets the device; `429`, `5xx` and
 * no answer try again after 1, 5 and 30 minutes; anything else, a fourth failure, or a row past its expiry is dropped. The app runs it
 * on a timer or from a job of its own.
 */
export async function runPushOutbox(options: RunPushOutboxOptions): Promise<OutboxPass> {
  const pass = { sent: 0, retry: 0, dropped: 0, forgotten: 0 };
  const { store, settings, now } = options;
  if (!settings) return pass;
  const claimed = await store.claim(now, options.leaseMs ?? LEASE_MS, options.batch ?? BATCH);

  const outcomes = await Promise.all(
    claimed.map(async (row): Promise<[ClaimedPush, SendOutcome | 'expired']> => {
      if (now >= row.expiresAt) return [row, 'expired'];
      const outcome = await sendPush({
        subscription: row.subscription,
        message: row.message,
        settings,
        now,
        ttlSeconds: Math.max(1, Math.floor((row.expiresAt - now) / 1000)),
        ...(options.hosts && { hosts: options.hosts }),
        ...(options.timeoutMs !== undefined && { timeoutMs: options.timeoutMs }),
        ...(options.fetch && { fetch: options.fetch }),
      });
      return [row, outcome];
    }),
  );

  const forgotten = new Set<string>();
  for (const [row, outcome] of outcomes) {
    if (outcome === 'sent') {
      await store.done(row.id);
      pass.sent += 1;
    } else if (outcome === 'gone') {
      if (!forgotten.has(row.endpoint)) {
        forgotten.add(row.endpoint);
        await store.forget(row.endpoint);
        pass.forgotten += 1;
      }
    } else if (outcome === 'retry') {
      const pause = BACKOFF_MS[row.attempts - 1];
      if (pause === undefined || now + pause >= row.expiresAt) {
        await store.drop(row.id);
        pass.dropped += 1;
      } else {
        await store.later(row.id, now + pause);
        pass.retry += 1;
      }
    } else {
      await store.drop(row.id);
      pass.dropped += 1;
    }
  }
  return pass;
}
