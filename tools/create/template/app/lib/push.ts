import type { Pool, PoolClient } from 'pg';
import {
  MAX_DEVICES,
  pushSettings,
  runPushOutbox,
  type ClaimedPush,
  type PushMessage,
  type PushSettings,
  type PushStore,
} from '@sovereignfs/push';
import { db } from './db';
import { open, seal } from './crypto';

/**
 * Web Push (`@sovereignfs/push`): the app's key from `__PREFIX___VAPID_PRIVATE_KEY`, which the instance makes once (`generate` in
 * sovereign.manifest.json). With no key the app sends no notifications, and the settings say nothing of them.
 */
let settings: PushSettings | undefined | null = null;
export function appPush(): PushSettings | undefined {
  if (settings === null) settings = pushSettings('__PREFIX__');
  return settings;
}

/** A device's keys are sealed under a key of their own, made from the app's secret (lib/crypto.ts). */
const PURPOSE = 'push devices';

type Queryable = Pick<Pool, 'query'> | PoolClient;

const isPool = (q: Queryable): q is Pool => 'connect' in q && 'totalCount' in q;

/** Runs `work` in one transaction: on a client of the pool, or in the transaction the caller is already in. */
async function atomically<T>(q: Queryable, work: (client: Queryable) => Promise<T>): Promise<T> {
  if (!isPool(q)) return work(q);
  const client = await q.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * The devices and waiting pushes, in the app's database (migrations/002_push.sql), as `@sovereignfs/push` asks for them. Give it the
 * client of a transaction to queue a push with the change that raised it: a change rolled back sends nothing.
 */
export function pushStore(q: Queryable = db()): PushStore {
  return {
    async saveDevice(account, subscription, now) {
      const keys = seal(
        JSON.stringify({ p256dh: subscription.p256dh, auth: subscription.auth }),
        PURPOSE,
      );
      await atomically(q, async (tx) => {
        // An endpoint another account had becomes this one's, and nothing that account was waiting for goes to it.
        await tx.query('DELETE FROM push_outbox WHERE endpoint = $1 AND account <> $2', [
          subscription.endpoint,
          account,
        ]);
        await tx.query(
          `INSERT INTO push_devices (endpoint, account, keys, saved_at) VALUES ($1, $2, $3, $4)
           ON CONFLICT (endpoint) DO UPDATE SET account = EXCLUDED.account, keys = EXCLUDED.keys, saved_at = EXCLUDED.saved_at`,
          [subscription.endpoint, account, keys, now],
        );
        await tx.query(
          `DELETE FROM push_devices WHERE account = $1 AND endpoint NOT IN (
             SELECT endpoint FROM push_devices WHERE account = $1 ORDER BY saved_at DESC, endpoint DESC LIMIT $2
           )`,
          [account, MAX_DEVICES],
        );
      });
    },

    async removeDevice(account, endpoint) {
      await q.query('DELETE FROM push_devices WHERE endpoint = $1 AND account = $2', [
        endpoint,
        account,
      ]);
    },

    async devices(account) {
      const { rows } = await q.query<{ endpoint: string; keys: string }>(
        'SELECT endpoint, keys FROM push_devices WHERE account = $1 ORDER BY saved_at, endpoint',
        [account],
      );
      return rows.flatMap((row) => {
        const keys = openKeys(row.keys);
        return keys ? [{ endpoint: row.endpoint, ...keys }] : [];
      });
    },

    async removeAccount(account) {
      await atomically(q, async (tx) => {
        await tx.query('DELETE FROM push_outbox WHERE account = $1', [account]);
        await tx.query('DELETE FROM push_devices WHERE account = $1', [account]);
      });
    },

    async forget(endpoint) {
      await q.query('DELETE FROM push_devices WHERE endpoint = $1', [endpoint]);
    },

    async enqueue(items) {
      for (const item of items) {
        // Only for a device that is the account's: never a push to someone else's device.
        await q.query(
          `INSERT INTO push_outbox (id, account, endpoint, message, due_at, expires_at)
           SELECT $1, $2, $3, $4, $5, $6
           WHERE EXISTS (SELECT 1 FROM push_devices WHERE endpoint = $3 AND account = $2)`,
          [
            item.id,
            item.account,
            item.endpoint,
            JSON.stringify(item.message),
            item.dueAt,
            item.expiresAt,
          ],
        );
      }
    },

    async claim(now, leaseMs, batch) {
      // One statement, and rows another runner holds are skipped: two runners never claim one push.
      const { rows } = await q.query<{
        id: string;
        account: string;
        endpoint: string;
        message: PushMessage;
        attempts: number;
        due_at: string;
        expires_at: string;
      }>(
        `UPDATE push_outbox SET attempts = attempts + 1, claimed_until = $1::bigint + $2::bigint
         WHERE id IN (
           SELECT id FROM push_outbox WHERE due_at <= $1 AND claimed_until <= $1
           ORDER BY due_at, id LIMIT $3 FOR UPDATE SKIP LOCKED
         ) AND due_at <= $1 AND claimed_until <= $1
         RETURNING id, account, endpoint, message, attempts, due_at, expires_at`,
        [now, leaseMs, batch],
      );
      if (rows.length === 0) return [];
      const devices = await q.query<{ endpoint: string; account: string; keys: string }>(
        'SELECT endpoint, account, keys FROM push_devices WHERE endpoint = ANY($1)',
        [[...new Set(rows.map((row) => row.endpoint))]],
      );
      const byEndpoint = new Map(devices.rows.map((device) => [device.endpoint, device]));
      const claimed: ClaimedPush[] = [];
      for (const row of rows) {
        const device = byEndpoint.get(row.endpoint);
        const keys = device && device.account === row.account ? openKeys(device.keys) : undefined;
        if (!keys) {
          // Its device is gone, or is someone else's now, or its keys were sealed under a secret the app no longer has.
          await q.query('DELETE FROM push_outbox WHERE id = $1', [row.id]);
          continue;
        }
        claimed.push({
          id: row.id,
          account: row.account,
          endpoint: row.endpoint,
          message: row.message,
          attempts: Number(row.attempts),
          dueAt: Number(row.due_at),
          expiresAt: Number(row.expires_at),
          subscription: { endpoint: row.endpoint, ...keys },
        });
      }
      return claimed.sort((a, b) => a.dueAt - b.dueAt || a.id.localeCompare(b.id));
    },

    async done(id) {
      await q.query('DELETE FROM push_outbox WHERE id = $1', [id]);
    },

    async later(id, at) {
      await q.query('UPDATE push_outbox SET due_at = $2, claimed_until = 0 WHERE id = $1', [
        id,
        at,
      ]);
    },

    async drop(id) {
      await q.query('DELETE FROM push_outbox WHERE id = $1', [id]);
    },
  };
}

function openKeys(sealed: string): { p256dh: string; auth: string } | undefined {
  try {
    const keys = JSON.parse(open(sealed, PURPOSE)) as { p256dh?: unknown; auth?: unknown };
    return typeof keys.p256dh === 'string' && typeof keys.auth === 'string'
      ? { p256dh: keys.p256dh, auth: keys.auth }
      : undefined;
  } catch {
    return undefined;
  }
}

/** Sends what is due now. Safe to call at any time: a pass already running is not doubled in this process, and the lease covers others. */
let running: Promise<unknown> | undefined;
export function sendDuePushes(): Promise<unknown> {
  running ??= runPushOutbox({ store: pushStore(), settings: appPush(), now: Date.now() })
    .catch(() => undefined)
    .finally(() => {
      running = undefined;
    });
  return running;
}

const OUTBOX_INTERVAL_MS = 15_000;
const started = Symbol.for('__NAME__.push-outbox');

/**
 * Called once at start-up (instrumentation.ts): reads the key, so a key or contact that is wrong stops the app here, and then sends
 * waiting pushes every fifteen seconds.
 */
export function startPushOutbox(): void {
  if (!appPush()) return;
  const global = globalThis as { [started]?: true };
  if (global[started]) return;
  global[started] = true;
  setInterval(() => void sendDuePushes(), OUTBOX_INTERVAL_MS).unref();
}
