import assert from 'node:assert/strict';
import { MAX_DEVICES, type PushStore, type QueuedPush } from '../store.js';
import type { Subscription } from '../subscription.js';

/** One case of the conformance suite: a name for the app's test runner, and the test. */
export interface ConformanceCase {
  readonly name: string;
  readonly run: () => Promise<void>;
}

const T0 = 1_800_000_000_000;
const LEASE = 60_000;

/** A subscription with keys of the right shape: the store keeps them and gives them back, and never checks them. */
export function sampleSubscription(n: number): Subscription {
  const fill = (length: number, first?: number) => {
    const bytes = Buffer.alloc(length, n % 256);
    if (first !== undefined) bytes[0] = first;
    return bytes.toString('base64url');
  };
  return {
    endpoint: `https://fcm.googleapis.com/fcm/send/device-${n}`,
    p256dh: fill(65, 4),
    auth: fill(16),
  };
}

const push = (id: string, account: string, endpoint: string, dueAt = T0): QueuedPush => ({
  id,
  account,
  endpoint,
  message: { title: `Push ${id}`, path: `/p/${id}`, data: { n: 1, ok: true } },
  dueAt,
  expiresAt: dueAt + 3_600_000,
});

const endpoints = (list: readonly Subscription[]) => list.map((s) => s.endpoint);
const ids = (list: readonly { id: string }[]) => list.map((row) => row.id).sort();

/**
 * The cases every {@link PushStore} passes (RFC 0009 §1.4), so every store behaves the same. `makeStore` gives a new, empty store for
 * each case. The suite uses `node:assert` alone, so any test runner can run it:
 *
 * ```ts
 * for (const { name, run } of pushStoreConformance(() => myStore())) it(name, run);
 * ```
 */
export function pushStoreConformance(
  makeStore: () => PushStore | Promise<PushStore>,
): ConformanceCase[] {
  const a = sampleSubscription(1);
  const b = sampleSubscription(2);
  const cases: [string, (store: PushStore) => Promise<void>][] = [
    [
      'saves a device for its account, keys and all, and lists it for no other',
      async (store) => {
        await store.saveDevice('alice', a, T0);
        assert.deepEqual(await store.devices('alice'), [a]);
        assert.deepEqual(await store.devices('bob'), []);
      },
    ],
    [
      'keeps one device per endpoint, with the keys saved last',
      async (store) => {
        await store.saveDevice('alice', a, T0);
        const renewed = { ...a, auth: sampleSubscription(9).auth };
        await store.saveDevice('alice', renewed, T0 + 1);
        assert.deepEqual(await store.devices('alice'), [renewed]);
      },
    ],
    [
      "gives an endpoint to the account that saves it last, and drops the other account's waiting pushes for it",
      async (store) => {
        await store.saveDevice('alice', a, T0);
        await store.enqueue([push('p1', 'alice', a.endpoint)]);
        await store.saveDevice('bob', a, T0 + 1);
        assert.deepEqual(await store.devices('alice'), []);
        assert.deepEqual(endpoints(await store.devices('bob')), [a.endpoint]);
        assert.deepEqual(await store.claim(T0 + 2, LEASE, 10), []);
      },
    ],
    [
      `keeps at most ${MAX_DEVICES} devices an account, replacing the one saved longest ago`,
      async (store) => {
        for (let n = 1; n <= MAX_DEVICES + 1; n += 1)
          await store.saveDevice('alice', sampleSubscription(n), T0 + n);
        const kept = endpoints(await store.devices('alice'));
        assert.equal(kept.length, MAX_DEVICES);
        assert.ok(!kept.includes(a.endpoint));
        assert.ok(kept.includes(sampleSubscription(MAX_DEVICES + 1).endpoint));
        assert.deepEqual(kept[0], b.endpoint);
      },
    ],
    [
      'removes a device only for its own account, with its waiting pushes',
      async (store) => {
        await store.saveDevice('alice', a, T0);
        await store.enqueue([push('p1', 'alice', a.endpoint)]);
        await store.removeDevice('bob', a.endpoint);
        assert.equal((await store.devices('alice')).length, 1);
        await store.removeDevice('alice', a.endpoint);
        assert.deepEqual(await store.devices('alice'), []);
        assert.deepEqual(await store.claim(T0, LEASE, 10), []);
      },
    ],
    [
      "removes an account's devices and waiting pushes, and no one else's",
      async (store) => {
        await store.saveDevice('alice', a, T0);
        await store.saveDevice('bob', b, T0);
        await store.enqueue([push('p1', 'alice', a.endpoint), push('p2', 'bob', b.endpoint)]);
        await store.removeAccount('alice');
        assert.deepEqual(await store.devices('alice'), []);
        assert.deepEqual(ids(await store.claim(T0, LEASE, 10)), ['p2']);
      },
    ],
    [
      'forgets a device the push service says is gone, with its waiting pushes',
      async (store) => {
        await store.saveDevice('alice', a, T0);
        await store.saveDevice('alice', b, T0);
        await store.enqueue([push('p1', 'alice', a.endpoint), push('p2', 'alice', b.endpoint)]);
        await store.forget(a.endpoint);
        assert.deepEqual(endpoints(await store.devices('alice')), [b.endpoint]);
        assert.deepEqual(ids(await store.claim(T0, LEASE, 10)), ['p2']);
      },
    ],
    [
      "does not queue a push for a device that is not the account's",
      async (store) => {
        await store.saveDevice('alice', a, T0);
        await store.enqueue([push('p1', 'bob', a.endpoint), push('p2', 'alice', b.endpoint)]);
        assert.deepEqual(await store.claim(T0, LEASE, 10), []);
      },
    ],
    [
      'claims what is due, oldest first, with the message and the subscription, counting the attempt',
      async (store) => {
        await store.saveDevice('alice', a, T0);
        await store.enqueue([
          push('late', 'alice', a.endpoint, T0 + 10),
          push('early', 'alice', a.endpoint, T0 + 5),
          push('future', 'alice', a.endpoint, T0 + 1_000),
        ]);
        const claimed = await store.claim(T0 + 10, LEASE, 10);
        assert.deepEqual(
          claimed.map((row) => row.id),
          ['early', 'late'],
        );
        const [first] = claimed;
        assert.ok(first);
        assert.equal(first.attempts, 1);
        assert.equal(first.account, 'alice');
        assert.equal(first.endpoint, a.endpoint);
        assert.equal(first.expiresAt, T0 + 5 + 3_600_000);
        assert.deepEqual(first.message, push('early', 'alice', a.endpoint).message);
        assert.deepEqual(first.subscription, a);
      },
    ],
    [
      'claims no more than the batch',
      async (store) => {
        await store.saveDevice('alice', a, T0);
        await store.enqueue(['p1', 'p2', 'p3'].map((id) => push(id, 'alice', a.endpoint)));
        assert.equal((await store.claim(T0, LEASE, 2)).length, 2);
        assert.equal((await store.claim(T0, LEASE, 2)).length, 1);
      },
    ],
    [
      'holds a claimed push until its lease ends, then counts the next attempt',
      async (store) => {
        await store.saveDevice('alice', a, T0);
        await store.enqueue([push('p1', 'alice', a.endpoint)]);
        assert.equal((await store.claim(T0, LEASE, 10)).length, 1);
        assert.deepEqual(await store.claim(T0 + LEASE - 1, LEASE, 10), []);
        const again = await store.claim(T0 + LEASE, LEASE, 10);
        assert.deepEqual(
          again.map((row) => [row.id, row.attempts]),
          [['p1', 2]],
        );
      },
    ],
    [
      'never gives one push to two claims made at once',
      async (store) => {
        await store.saveDevice('alice', a, T0);
        await store.enqueue(
          Array.from({ length: 20 }, (_, n) => push(`p${n}`, 'alice', a.endpoint)),
        );
        const [one, two] = await Promise.all([
          store.claim(T0, LEASE, 15),
          store.claim(T0, LEASE, 15),
        ]);
        const all = [...one, ...two].map((row) => row.id);
        assert.equal(all.length, 20);
        assert.equal(new Set(all).size, 20);
      },
    ],
    [
      'sends a push later when asked, released from its lease',
      async (store) => {
        await store.saveDevice('alice', a, T0);
        await store.enqueue([push('p1', 'alice', a.endpoint)]);
        await store.claim(T0, LEASE, 10);
        await store.later('p1', T0 + 5_000);
        assert.deepEqual(await store.claim(T0 + 4_999, LEASE, 10), []);
        assert.deepEqual(ids(await store.claim(T0 + 5_000, LEASE, 10)), ['p1']);
      },
    ],
    [
      'removes a push that is done or dropped',
      async (store) => {
        await store.saveDevice('alice', a, T0);
        await store.enqueue([push('p1', 'alice', a.endpoint), push('p2', 'alice', a.endpoint)]);
        await store.claim(T0, LEASE, 10);
        await store.done('p1');
        await store.drop('p2');
        assert.deepEqual(await store.claim(T0 + LEASE, LEASE, 10), []);
        await store.done('p1'); // a second time is nothing
      },
    ],
  ];
  return cases.map(([name, test]) => ({
    name,
    run: async () => test(await makeStore()),
  }));
}
