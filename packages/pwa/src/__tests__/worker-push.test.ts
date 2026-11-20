import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { serviceWorkerSource, type WorkerPushOptions } from '../worker';

/** The worker's push handlers, tested as the text a browser is sent, with a stand-in for a worker's events, notifications and windows. */
const ORIGIN = 'https://tasks.example.org';
type Handler = (event: unknown) => void;
type Page = { url: string; focus: () => Promise<Page>; navigate: (url: string) => Promise<Page> };

function boot(push: WorkerPushOptions | undefined, pages: Page[] = []) {
  const handlers = new Map<string, Handler>();
  const shown: { title: string; options: Record<string, unknown> }[] = [];
  const opened: string[] = [];
  const storage = { put: vi.fn(), open: vi.fn() };
  vm.runInNewContext(serviceWorkerSource({ version: 'build-1', ...(push && { push }) }), {
    self: {
      location: { origin: ORIGIN },
      addEventListener: (type: string, handler: Handler) => handlers.set(type, handler),
      registration: {
        showNotification: (title: string, options: Record<string, unknown>) => {
          shown.push({ title, options });
          return Promise.resolve();
        },
      },
      clients: {
        claim: () => Promise.resolve(),
        matchAll: () => Promise.resolve(pages),
        openWindow: (url: string) => {
          opened.push(url);
          return Promise.resolve(null);
        },
      },
    },
    // A push must store nothing: any use of the caches or IndexedDB fails the test.
    caches: storage,
    indexedDB: storage,
    fetch: () => Promise.reject(new Error('a push fetches nothing')),
    Response,
    URL,
    Promise,
    Array,
    setTimeout,
    clearTimeout,
  });
  return { handlers, shown, opened, storage };
}

async function deliver(worker: ReturnType<typeof boot>, data: unknown) {
  const waits: Promise<unknown>[] = [];
  worker.handlers.get('push')?.({
    data:
      data === undefined
        ? null
        : {
            json: () => (typeof data === 'string' ? JSON.parse(data) : data),
          },
    waitUntil: (promise: Promise<unknown>) => waits.push(promise),
  });
  await Promise.all(waits);
  return worker.shown.at(-1);
}

async function click(worker: ReturnType<typeof boot>, data: unknown) {
  const waits: Promise<unknown>[] = [];
  const close = vi.fn();
  worker.handlers.get('notificationclick')?.({
    notification: { data, close },
    waitUntil: (promise: Promise<unknown>) => waits.push(promise),
  });
  await Promise.all(waits);
  return close;
}

const PUSH: WorkerPushOptions = {
  name: 'Tasks',
  icon: '/icons/icon-192.png',
  badge: '/icons/badge.png',
};

describe('the worker without push', () => {
  it('has no push handlers, and its text is what it was', () => {
    const worker = boot(undefined);
    expect(worker.handlers.has('push')).toBe(false);
    expect(worker.handlers.has('notificationclick')).toBe(false);
    expect(serviceWorkerSource({ version: 'b' })).not.toMatch(/push|notification/i);
  });
});

describe('the worker with push', () => {
  it('shows a message as it came, with the icon, and keeps nothing', async () => {
    const worker = boot(PUSH);
    const shown = await deliver(worker, {
      title: 'A card is due',
      body: 'Write the report',
      path: '/cards/7',
      tag: 'card-7',
    });
    expect(shown).toEqual({
      title: 'A card is due',
      options: {
        icon: '/icons/icon-192.png',
        badge: '/icons/badge.png',
        body: 'Write the report',
        tag: 'card-7',
        data: { path: '/cards/7' },
      },
    });
    expect(worker.storage.open).not.toHaveBeenCalled();
    expect(worker.storage.put).not.toHaveBeenCalled();
  });

  it("shows the app's name for a push it cannot read, or one with nothing in it", async () => {
    for (const data of [undefined, 'not json', '[1,2]', '"text"', {}, { title: 42 }]) {
      const worker = boot(PUSH);
      const waits: Promise<unknown>[] = [];
      worker.handlers.get('push')?.({
        data:
          data === undefined
            ? null
            : {
                json: () => (typeof data === 'string' ? JSON.parse(data) : data),
              },
        waitUntil: (promise: Promise<unknown>) => waits.push(promise),
      });
      await Promise.all(waits);
      expect(worker.shown, JSON.stringify(data)).toHaveLength(1);
      expect(worker.shown[0]?.title).toBe('Tasks');
      expect(worker.shown[0]?.options.body).toBe('You have a new notification');
      expect(worker.shown[0]?.options.data).toEqual({ path: '/' });
    }
  });

  it('cuts what is too long, and sends a path to another site home', async () => {
    const worker = boot(PUSH);
    for (const path of [
      'https://evil.example/',
      '//evil.example/x',
      '/\\evil.example',
      'cards/1',
      '/a b',
    ])
      expect((await deliver(worker, { title: 'x', path }))?.options.data).toEqual({ path: '/' });
    const long = await deliver(worker, {
      title: 't'.repeat(200),
      body: 'b'.repeat(600),
      tag: 'g'.repeat(150),
    });
    expect(long?.title).toHaveLength(120);
    expect(long?.options.body).toHaveLength(500);
    expect(long?.options.tag).toHaveLength(100);
  });

  it("asks the app's onPushKind, and shows what it returns", async () => {
    const handlers = `async function onPushKind(kind, data, message) {
      if (kind === 'due') return { title: data.count + ' cards due', path: '/today' };
      if (kind === 'throws') throw new Error('no');
      return undefined;
    }`;
    const worker = boot({ ...PUSH, handlers });
    expect(
      await deliver(worker, { title: 'Reminder', kind: 'due', data: { count: 3 } }),
    ).toMatchObject({
      title: '3 cards due',
      options: { data: { path: '/today' } },
    });
    // Nothing returned, an unknown kind, or a handler that throws: the message as it came.
    expect((await deliver(worker, { title: 'Reminder', kind: 'other' }))?.title).toBe('Reminder');
    expect((await deliver(worker, { title: 'Reminder', kind: 'throws' }))?.title).toBe('Reminder');
    expect((await deliver(worker, { kind: 'throws' }))?.title).toBe('Tasks');
  });

  it('shows something even when the app returns what cannot be shown', async () => {
    const worker = boot({
      ...PUSH,
      handlers: 'async function onPushKind() { return { title: {} , path: 7 }; }',
    });
    const shown = await deliver(worker, { title: 'x', kind: 'any' });
    expect(shown?.title).toBe('Tasks');
    expect(shown?.options.data).toEqual({ path: '/' });
  });

  it('opens a window of the app at the path when none is open', async () => {
    const worker = boot(PUSH);
    const close = await click(worker, { path: '/cards/7' });
    expect(close).toHaveBeenCalled();
    expect(worker.opened).toEqual([`${ORIGIN}/cards/7`]);
  });

  it("focuses a window of the app and sends it there, never another site's window", async () => {
    const navigate = vi.fn((url: string) => Promise.resolve({ url } as Page));
    const ours: Page = { url: `${ORIGIN}/settings`, focus: () => Promise.resolve(ours), navigate };
    const theirs: Page = {
      url: 'https://other.example/',
      focus: vi.fn(() => Promise.resolve(theirs)),
      navigate: vi.fn(),
    };
    const worker = boot(PUSH, [theirs, ours]);
    await click(worker, { path: '//evil.example/' });
    expect(theirs.focus).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(`${ORIGIN}/`);
    expect(worker.opened).toEqual([]);
  });

  it('refuses options that are not paths or a name', () => {
    expect(() =>
      serviceWorkerSource({ version: 'b', push: { ...PUSH, icon: 'https://cdn.example/i.png' } }),
    ).toThrow(TypeError);
    expect(() => serviceWorkerSource({ version: 'b', push: { ...PUSH, name: ' ' } })).toThrow(
      TypeError,
    );
  });
});
