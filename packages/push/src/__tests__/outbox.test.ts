import { describe, expect, it } from 'vitest';
import { generatePushKeys } from '../keys';
import { PushMessageError } from '../message';
import { BACKOFF_MS, enqueuePush, runPushOutbox } from '../outbox';
import { pushSubscriptionHandlers } from '../route';
import type { PushSettings } from '../settings';
import { memoryPushStore, pushStoreConformance, sampleSubscription } from '../testing';

const settings: PushSettings = { ...generatePushKeys(), subject: 'https://app.example.com' };
const T0 = 1_800_000_000_000;

describe('the in-memory store', () => {
  for (const { name, run } of pushStoreConformance(() => memoryPushStore())) it(name, run);
});

/** A push service that answers each request with the next status, and counts what it received. */
function service(...statuses: (number | Error)[]) {
  const received: string[] = [];
  const fetch: typeof globalThis.fetch = async (url) => {
    received.push(String(url));
    const status = statuses.length > 1 ? statuses.shift() : statuses[0];
    if (status instanceof Error) throw status;
    return new Response(null, { status: status ?? 201 });
  };
  return { received, fetch };
}

// A browser's real keys (RFC 8291's example receiver), so a push can be encrypted to every device.
const device = (n: number) => ({
  endpoint: sampleSubscription(n).endpoint,
  p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
});

async function withDevices(count: number) {
  const store = memoryPushStore();
  for (let n = 1; n <= count; n += 1) await store.saveDevice('alice', device(n), T0);
  return store;
}

describe('enqueuePush and runPushOutbox', () => {
  it("queues one push for each of the account's devices and sends each once", async () => {
    const store = await withDevices(3);
    expect(await enqueuePush(store, { account: 'alice', message: { title: 'Hi' }, now: T0 })).toBe(
      3,
    );
    expect(await enqueuePush(store, { account: 'bob', message: { title: 'Hi' }, now: T0 })).toBe(0);
    const push = service(201);
    expect(await runPushOutbox({ store, settings, now: T0, fetch: push.fetch })).toEqual({
      sent: 3,
      retry: 0,
      dropped: 0,
      forgotten: 0,
    });
    expect(await runPushOutbox({ store, settings, now: T0 + 120_000, fetch: push.fetch })).toEqual({
      sent: 0,
      retry: 0,
      dropped: 0,
      forgotten: 0,
    });
    expect(push.received).toHaveLength(3);
  });

  it('refuses a message outside its limits when it is queued, not when it is sent', async () => {
    const store = await withDevices(1);
    await expect(
      enqueuePush(store, { account: 'alice', message: { title: '' }, now: T0 }),
    ).rejects.toThrow(PushMessageError);
  });

  it('sends nothing with no key, and the push waits', async () => {
    const store = await withDevices(1);
    await enqueuePush(store, { account: 'alice', message: { title: 'Hi' }, now: T0 });
    const push = service(201);
    expect(
      (await runPushOutbox({ store, settings: undefined, now: T0, fetch: push.fetch })).sent,
    ).toBe(0);
    expect((await runPushOutbox({ store, settings, now: T0, fetch: push.fetch })).sent).toBe(1);
  });

  it('two runners over one store never send one push twice', async () => {
    const store = await withDevices(10);
    for (let n = 0; n < 3; n += 1)
      await enqueuePush(store, { account: 'alice', message: { title: `Hi ${n}` }, now: T0 });
    const push = service(201);
    const passes = await Promise.all(
      Array.from({ length: 4 }, () =>
        runPushOutbox({ store, settings, now: T0, batch: 7, fetch: push.fetch }),
      ),
    );
    expect(passes.reduce((total, pass) => total + pass.sent, 0)).toBe(28);
    expect(new Set(push.received).size).toBe(10);
    const rest = await runPushOutbox({ store, settings, now: T0, batch: 50, fetch: push.fetch });
    expect(rest.sent).toBe(2);
    expect(push.received).toHaveLength(30);
  });

  it('forgets a device the push service says is gone, with its waiting pushes', async () => {
    const store = await withDevices(1);
    await enqueuePush(store, { account: 'alice', message: { title: 'One' }, now: T0 });
    await enqueuePush(store, { account: 'alice', message: { title: 'Two' }, now: T0 });
    const pass = await runPushOutbox({ store, settings, now: T0, fetch: service(410).fetch });
    expect(pass).toMatchObject({ sent: 0, forgotten: 1 });
    expect(await store.devices('alice')).toEqual([]);
    expect(await store.claim(T0 + 10 * 60_000, 60_000, 10)).toEqual([]);
  });

  it('tries again after 1, 5 and 30 minutes, then gives up', async () => {
    const store = await withDevices(1);
    await enqueuePush(store, {
      account: 'alice',
      message: { title: 'Hi' },
      now: T0,
      ttlMs: 24 * 3_600_000,
    });
    const push = service(503);
    let now = T0;
    for (const pause of BACKOFF_MS) {
      expect(await runPushOutbox({ store, settings, now, fetch: push.fetch })).toMatchObject({
        retry: 1,
      });
      expect(
        (await runPushOutbox({ store, settings, now: now + pause - 1, fetch: push.fetch })).retry,
      ).toBe(0);
      now += pause;
    }
    expect(await runPushOutbox({ store, settings, now, fetch: push.fetch })).toMatchObject({
      retry: 0,
      dropped: 1,
    });
    expect(push.received).toHaveLength(4);
  });

  it('drops a push that is refused, or past its expiry', async () => {
    const store = await withDevices(1);
    await enqueuePush(store, { account: 'alice', message: { title: 'Hi' }, now: T0 });
    expect(
      await runPushOutbox({ store, settings, now: T0, fetch: service(400).fetch }),
    ).toMatchObject({
      dropped: 1,
    });
    await enqueuePush(store, {
      account: 'alice',
      message: { title: 'Late' },
      now: T0,
      ttlMs: 1000,
    });
    const push = service(201);
    expect(
      await runPushOutbox({ store, settings, now: T0 + 1000, fetch: push.fetch }),
    ).toMatchObject({
      dropped: 1,
    });
    expect(push.received).toHaveLength(0);
  });

  it('does not wait past the expiry to try again', async () => {
    const store = await withDevices(1);
    await enqueuePush(store, {
      account: 'alice',
      message: { title: 'Hi' },
      now: T0,
      ttlMs: 2 * 60_000,
    });
    const push = service(503);
    expect(await runPushOutbox({ store, settings, now: T0, fetch: push.fetch })).toMatchObject({
      retry: 1,
    });
    expect(
      await runPushOutbox({ store, settings, now: T0 + 60_000, fetch: push.fetch }),
    ).toMatchObject({
      dropped: 1,
    });
  });
});

describe('pushSubscriptionHandlers', () => {
  const ORIGIN = 'https://app.example.com';
  const URL_ = `${ORIGIN}/api/push/subscription`;
  const json = (body: unknown, headers: Record<string, string> = {}) => ({
    method: 'POST',
    headers: { origin: ORIGIN, 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const subscription = sampleSubscription(1);
  const browserJson = {
    endpoint: subscription.endpoint,
    expirationTime: null,
    keys: { p256dh: subscription.p256dh, auth: subscription.auth },
  };
  const make = (withKey = true) => {
    const store = memoryPushStore();
    const handlers = pushSubscriptionHandlers({
      store,
      settings: withKey ? settings : undefined,
      account: (request) => request.headers.get('x-account') ?? undefined,
      now: () => T0,
    });
    return { store, handlers };
  };

  it('says whether push is available, and the public key, to a signed-in account only', async () => {
    const { handlers } = make();
    const signedIn = await handlers.GET(new Request(URL_, { headers: { 'x-account': 'alice' } }));
    expect(signedIn.status).toBe(200);
    expect(signedIn.headers.get('cache-control')).toBe('no-store');
    expect(await signedIn.json()).toEqual({ available: true, publicKey: settings.publicKey });
    expect((await handlers.GET(new Request(URL_))).status).toBe(401);
    const none = await make(false).handlers.GET(
      new Request(URL_, { headers: { 'x-account': 'alice' } }),
    );
    expect(await none.json()).toEqual({ available: false });
  });

  it("saves a device for the caller, and removes only the caller's", async () => {
    const { store, handlers } = make();
    const saved = await handlers.POST(
      new Request(URL_, json(browserJson, { 'x-account': 'alice' })),
    );
    expect(saved.status).toBe(204);
    expect(saved.headers.get('cache-control')).toBe('no-store');
    expect(await store.devices('alice')).toEqual([subscription]);

    const other = await handlers.DELETE(
      new Request(URL_, {
        ...json({ endpoint: subscription.endpoint }, { 'x-account': 'bob' }),
        method: 'DELETE',
      }),
    );
    expect(other.status).toBe(204);
    expect(await store.devices('alice')).toHaveLength(1);
    const own = await handlers.DELETE(
      new Request(URL_, {
        ...json({ endpoint: subscription.endpoint }, { 'x-account': 'alice' }),
        method: 'DELETE',
      }),
    );
    expect(own.status).toBe(204);
    expect(await store.devices('alice')).toEqual([]);
  });

  it('refuses another origin, no origin, no account, no key, and a body that is not a subscription', async () => {
    const { store, handlers } = make();
    const status = async (init: RequestInit, h = handlers) =>
      (await h.POST(new Request(URL_, init))).status;
    expect(
      await status(json(browserJson, { 'x-account': 'alice', origin: 'https://evil.example' })),
    ).toBe(403);
    const noOrigin = json(browserJson, { 'x-account': 'alice' });
    delete (noOrigin.headers as Record<string, string>).origin;
    expect(await status(noOrigin)).toBe(403);
    expect(await status(json(browserJson))).toBe(401);
    expect(await status(json(browserJson, { 'x-account': 'alice' }), make(false).handlers)).toBe(
      503,
    );
    expect(
      await status(
        json({ ...browserJson, endpoint: 'https://evil.example/x' }, { 'x-account': 'alice' }),
      ),
    ).toBe(400);
    expect(await status({ ...json(browserJson, { 'x-account': 'alice' }), body: 'not json' })).toBe(
      400,
    );
    expect(
      await status(json({ ...browserJson, pad: 'x'.repeat(5000) }, { 'x-account': 'alice' })),
    ).toBe(400);
    expect(await store.devices('alice')).toEqual([]);
    const deleted = await handlers.DELETE(
      new Request(URL_, {
        ...json(
          { endpoint: subscription.endpoint },
          { 'x-account': 'alice', origin: 'https://evil.example' },
        ),
        method: 'DELETE',
      }),
    );
    expect(deleted.status).toBe(403);
  });

  it("takes the app's origin when it is given, rather than the request's", async () => {
    const store = memoryPushStore();
    const handlers = pushSubscriptionHandlers({
      store,
      settings,
      account: () => 'alice',
      origin: 'https://public.example.com',
    });
    const internal = 'http://0.0.0.0:3000/api/push/subscription';
    const post = (origin: string) =>
      handlers.POST(new Request(internal, { ...json(browserJson), headers: { origin } }));
    expect((await post('http://0.0.0.0:3000')).status).toBe(403);
    expect((await post('https://public.example.com')).status).toBe(204);
  });
});
