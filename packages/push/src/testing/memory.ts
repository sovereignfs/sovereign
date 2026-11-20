import { MAX_DEVICES, type ClaimedPush, type PushStore, type QueuedPush } from '../store.js';
import type { Subscription } from '../subscription.js';

interface Device {
  account: string;
  subscription: Subscription;
  savedAt: number;
  order: number;
}
interface Row extends Omit<QueuedPush, 'dueAt'> {
  dueAt: number;
  attempts: number;
  claimedUntil: number;
}

/**
 * A {@link PushStore} in memory, for tests and for trying the package out. It passes the conformance suite, and is the reference for
 * what a store does; an app keeps its devices and pushes in its own database.
 */
export function memoryPushStore(): PushStore {
  const devices = new Map<string, Device>();
  const rows = new Map<string, Row>();
  let counter = 0;

  const dropRows = (match: (row: Row) => boolean) => {
    for (const [id, row] of rows) if (match(row)) rows.delete(id);
  };
  const removeEndpoint = (endpoint: string) => {
    devices.delete(endpoint);
    dropRows((row) => row.endpoint === endpoint);
  };
  const ofAccount = (account: string) =>
    [...devices.values()]
      .filter((device) => device.account === account)
      .sort((a, b) => a.savedAt - b.savedAt || a.order - b.order);

  return {
    async saveDevice(account, subscription, now) {
      const there = devices.get(subscription.endpoint);
      if (there && there.account !== account)
        dropRows((row) => row.endpoint === subscription.endpoint);
      devices.set(subscription.endpoint, {
        account,
        subscription: {
          endpoint: subscription.endpoint,
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
        savedAt: now,
        order: (counter += 1),
      });
      const mine = ofAccount(account);
      for (const device of mine.slice(0, Math.max(0, mine.length - MAX_DEVICES)))
        removeEndpoint(device.subscription.endpoint);
    },
    async removeDevice(account, endpoint) {
      if (devices.get(endpoint)?.account === account) removeEndpoint(endpoint);
    },
    async devices(account) {
      return ofAccount(account).map((device) => ({ ...device.subscription }));
    },
    async removeAccount(account) {
      for (const device of ofAccount(account)) removeEndpoint(device.subscription.endpoint);
      dropRows((row) => row.account === account);
    },
    async forget(endpoint) {
      removeEndpoint(endpoint);
    },
    async enqueue(items) {
      for (const item of items) {
        const device = devices.get(item.endpoint);
        // A push for a device that is not the account's has nowhere to go.
        if (device?.account !== item.account) continue;
        rows.set(item.id, { ...item, attempts: 0, claimedUntil: 0 });
      }
    },
    async claim(now, leaseMs, batch) {
      const due = [...rows.values()]
        .filter((row) => row.dueAt <= now && row.claimedUntil <= now)
        .sort((a, b) => a.dueAt - b.dueAt || a.id.localeCompare(b.id))
        .slice(0, batch);
      const out: ClaimedPush[] = [];
      for (const row of due) {
        const device = devices.get(row.endpoint);
        if (!device) {
          rows.delete(row.id);
          continue;
        }
        row.attempts += 1;
        row.claimedUntil = now + leaseMs;
        out.push({
          id: row.id,
          account: row.account,
          endpoint: row.endpoint,
          message: row.message,
          dueAt: row.dueAt,
          expiresAt: row.expiresAt,
          attempts: row.attempts,
          subscription: { ...device.subscription },
        });
      }
      return out;
    },
    async done(id) {
      rows.delete(id);
    },
    async later(id, at) {
      const row = rows.get(id);
      if (row) {
        row.dueAt = at;
        row.claimedUntil = 0;
      }
    },
    async drop(id) {
      rows.delete(id);
    },
  };
}
