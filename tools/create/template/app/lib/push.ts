import type { Database, Executor } from '@sovereignfs/auth/database';
import {
  MAX_DEVICES,
  pushSettings,
  runPushOutbox,
  type ClaimedPush,
  type PushMessage,
  type PushSettings,
  type PushStore,
} from '@sovereignfs/push';
import { database } from './db';
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

/** The database, or the executor of a transaction the caller is already in. */
type Queryable = Database | Executor;

const isDatabase = (q: Queryable): q is Database => 'transaction' in q;

/** Runs `work` in one transaction: a new one on the database, or the one the caller is already in. */
function atomically<T>(q: Queryable, work: (tx: Executor) => Promise<T>): Promise<T> {
  return isDatabase(q) ? q.transaction(work) : work(q);
}

/**
 * The devices and waiting pushes, in the app's database (`0002_push.sql` in migrations/postgres and migrations/sqlite), as `@sovereignfs/push` asks for them, the same on
 * a SQLite file, sqld and PostgreSQL. Give it the executor of a transaction to queue a push with the change that raised it: a change
 * rolled back sends nothing. Without one, it uses the app's database.
 */
export function pushStore(given?: Queryable): PushStore {
  const q = async (): Promise<Queryable> => given ?? (await database());
  return {
    async saveDevice(account, subscription, now) {
      const keys = seal(
        JSON.stringify({ p256dh: subscription.p256dh, auth: subscription.auth }),
        PURPOSE,
      );
      await atomically(await q(), async (tx) => {
        // An endpoint another account had becomes this one's, and nothing that account was waiting for goes to it.
        await tx.run('DELETE FROM push_outbox WHERE endpoint = ? AND account <> ?', [
          subscription.endpoint,
          account,
        ]);
        await tx.run(
          `INSERT INTO push_devices (endpoint, account, keys, saved_at) VALUES (?, ?, ?, ?)
           ON CONFLICT (endpoint) DO UPDATE SET account = EXCLUDED.account, keys = EXCLUDED.keys, saved_at = EXCLUDED.saved_at`,
          [subscription.endpoint, account, keys, now],
        );
        await tx.run(
          `DELETE FROM push_devices WHERE account = ? AND endpoint NOT IN (
             SELECT endpoint FROM push_devices WHERE account = ? ORDER BY saved_at DESC, endpoint DESC LIMIT ?
           )`,
          [account, account, MAX_DEVICES],
        );
      });
    },

    async removeDevice(account, endpoint) {
      await (
        await q()
      ).run('DELETE FROM push_devices WHERE endpoint = ? AND account = ?', [endpoint, account]);
    },

    async devices(account) {
      const { rows } = await (
        await q()
      ).run(
        'SELECT endpoint, keys FROM push_devices WHERE account = ? ORDER BY saved_at, endpoint',
        [account],
      );
      return rows.flatMap((row) => {
        const keys = openKeys(String(row.keys));
        return keys ? [{ endpoint: String(row.endpoint), ...keys }] : [];
      });
    },

    async removeAccount(account) {
      await atomically(await q(), async (tx) => {
        await tx.run('DELETE FROM push_outbox WHERE account = ?', [account]);
        await tx.run('DELETE FROM push_devices WHERE account = ?', [account]);
      });
    },

    async forget(endpoint) {
      await (await q()).run('DELETE FROM push_devices WHERE endpoint = ?', [endpoint]);
    },

    async enqueue(items) {
      const runner = await q();
      for (const item of items) {
        // Only for a device that is the account's: never a push to someone else's device.
        await runner.run(
          `INSERT INTO push_outbox (id, account, endpoint, message, due_at, expires_at)
           SELECT ?, ?, ?, ?, ?, ?
           WHERE EXISTS (SELECT 1 FROM push_devices WHERE endpoint = ? AND account = ?)`,
          [
            item.id,
            item.account,
            item.endpoint,
            JSON.stringify(item.message),
            item.dueAt,
            item.expiresAt,
            item.endpoint,
            item.account,
          ],
        );
      }
    },

    async claim(now, leaseMs, batch) {
      const runner = await q();
      // The due rows, then each taken by an update that holds only while nobody else has it: two runners never claim one push, on any
      // of the three forms (no row locks needed). Rows another runner took first drop out of the next look, so runners share the work.
      const rows: {
        id: string;
        account: string;
        endpoint: string;
        message: string;
        attempts: number;
        due_at: number;
        expires_at: number;
      }[] = [];
      while (rows.length < batch) {
        const due = await runner.run(
          'SELECT id FROM push_outbox WHERE due_at <= ? AND claimed_until <= ? ORDER BY due_at, id LIMIT ?',
          [now, now, batch - rows.length],
        );
        if (due.rows.length === 0) break;
        for (const { id } of due.rows) {
          const taken = await runner.run(
            `UPDATE push_outbox SET attempts = attempts + 1, claimed_until = ?
               WHERE id = ? AND due_at <= ? AND claimed_until <= ?`,
            [now + leaseMs, id, now, now],
          );
          if (taken.rowsAffected !== 1) continue;
          const row = (
            await runner.run(
              'SELECT id, account, endpoint, message, attempts, due_at, expires_at FROM push_outbox WHERE id = ?',
              [id],
            )
          ).rows[0];
          if (row) rows.push(row as (typeof rows)[number]);
        }
      }
      if (rows.length === 0) return [];
      const endpoints = [...new Set(rows.map((row) => row.endpoint))];
      const devices = await runner.run(
        `SELECT endpoint, account, keys FROM push_devices WHERE endpoint IN (${endpoints.map(() => '?').join(', ')})`,
        endpoints,
      );
      const byEndpoint = new Map(
        devices.rows.map((device) => [
          String(device.endpoint),
          device as { account: string; keys: string },
        ]),
      );
      const claimed: ClaimedPush[] = [];
      for (const row of rows) {
        const device = byEndpoint.get(row.endpoint);
        const keys = device && device.account === row.account ? openKeys(device.keys) : undefined;
        if (!keys) {
          // Its device is gone, or is someone else's now, or its keys were sealed under a secret the app no longer has.
          await runner.run('DELETE FROM push_outbox WHERE id = ?', [row.id]);
          continue;
        }
        claimed.push({
          id: row.id,
          account: row.account,
          endpoint: row.endpoint,
          message: JSON.parse(row.message) as PushMessage,
          attempts: Number(row.attempts),
          dueAt: Number(row.due_at),
          expiresAt: Number(row.expires_at),
          subscription: { endpoint: row.endpoint, ...keys },
        });
      }
      return claimed.sort((a, b) => a.dueAt - b.dueAt || a.id.localeCompare(b.id));
    },

    async done(id) {
      await (await q()).run('DELETE FROM push_outbox WHERE id = ?', [id]);
    },

    async later(id, at) {
      await (
        await q()
      ).run('UPDATE push_outbox SET due_at = ?, claimed_until = 0 WHERE id = ?', [at, id]);
    },

    async drop(id) {
      await (await q()).run('DELETE FROM push_outbox WHERE id = ?', [id]);
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
