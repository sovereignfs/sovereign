import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { SYNC_MESSAGE } from '../message';
import { serviceWorkerSource, type WorkerOptions } from '../worker';

/**
 * What an app adds to the worker (`sync`, `fetchHandlers`): Background Sync for the app's own tags, and answers of its own for requests the
 * worker leaves to the network, never in place of its rules for pages and kept files.
 */
const ORIGIN = 'https://tiles.example.org';

type Handler = (event: Record<string, unknown>) => void;

function boot(options: Partial<WorkerOptions> = {}) {
  const handlers = new Map<string, Handler>();
  const posted: unknown[] = [];
  const pages = [
    { postMessage: (m: unknown) => posted.push(m) },
    { postMessage: (m: unknown) => posted.push(m) },
  ];
  const matchAll = vi.fn(() => Promise.resolve(pages));
  const network = vi.fn(() => Promise.resolve(new Response('network')));
  const context = {
    self: {
      location: { origin: ORIGIN },
      addEventListener: (type: string, handler: Handler) => handlers.set(type, handler),
      skipWaiting: vi.fn(),
      clients: { claim: () => Promise.resolve(), matchAll },
    },
    caches: {
      open: () =>
        Promise.resolve({ match: () => Promise.resolve(undefined), put: () => Promise.resolve() }),
      keys: () => Promise.resolve([]),
      delete: () => Promise.resolve(true),
    },
    fetch: network,
    Request,
    Response,
    URL,
    Promise,
    setTimeout,
    clearTimeout,
  };
  vm.runInNewContext(serviceWorkerSource({ version: 'build-1', ...options }), context);
  const fire = async (type: string, event: Record<string, unknown>) => {
    const waits: Promise<unknown>[] = [];
    let answer: Promise<Response> | undefined;
    handlers.get(type)?.({
      ...event,
      waitUntil: (p: Promise<unknown>) => waits.push(p),
      respondWith: (p: Promise<Response>) => (answer = p),
    });
    await Promise.all(waits);
    return answer ? await answer : undefined;
  };
  const get = (path: string) => fire('fetch', { request: new Request(new URL(path, ORIGIN)) });
  return {
    handlers,
    posted,
    matchAll,
    network,
    fire,
    get,
    self: context.self as Record<string, unknown>,
  };
}

/** A navigation, which a real request's `mode` says and a test cannot set. */
const navigation = (path: string) =>
  new (class extends Request {
    override get mode(): RequestMode {
      return 'navigate';
    }
  })(new URL(path, ORIGIN));

describe('Background Sync', () => {
  it('is not listened for unless the app asks', () => {
    expect(boot().handlers.has('sync')).toBe(false);
  });

  it('tells every open page to sync, for one of the app’s tags only', async () => {
    const worker = boot({ sync: { tags: ['lists'] } });
    await worker.fire('sync', { tag: 'someone-else' });
    expect(worker.posted).toEqual([]);
    await worker.fire('sync', { tag: 'lists' });
    expect(worker.posted).toEqual([
      { type: SYNC_MESSAGE, tag: 'lists' },
      { type: SYNC_MESSAGE, tag: 'lists' },
    ]);
    expect(worker.matchAll).toHaveBeenCalledWith({ type: 'window', includeUncontrolled: true });
  });

  it('posts the app’s own message when it names one', async () => {
    const worker = boot({ sync: { tags: ['lists'], message: 'shopper-sync' } });
    await worker.fire('sync', { tag: 'lists' });
    expect(worker.posted[0]).toEqual({ type: 'shopper-sync', tag: 'lists' });
  });

  it('runs the app’s own handler in place of the message, and waits for it', async () => {
    const worker = boot({
      sync: {
        tags: ['wake'],
        handlers: 'async function onSync(tag) { self.synced = tag; }',
      },
    });
    await worker.fire('sync', { tag: 'wake' });
    expect(worker.posted).toEqual([]);
    expect(worker.self.synced).toBe('wake');
  });

  it.each([
    [{ tags: [] }, 'sync.tags must name at least one tag'],
    [{ tags: [''] }, 'sync.tags must be strings'],
    [{ tags: ['a'], handlers: 1 as unknown as string }, 'sync.handlers must be JavaScript text'],
  ])('refuses options that cannot work: %j', (sync, message) => {
    expect(() => serviceWorkerSource({ version: '1', sync })).toThrow(message);
  });
});

describe('the app’s own fetch handlers', () => {
  const handlers = `function onFetch(request, url) {
    if (url.pathname.indexOf('/tiles/') === 0) return Promise.resolve(new Response('tile'));
  }`;

  it('answer what the worker would leave to the network', async () => {
    const worker = boot({ fetchHandlers: handlers });
    expect(await (await worker.get('/tiles/1/2/3.png'))?.text()).toBe('tile');
  });

  it('leave alone what they do not answer', async () => {
    const worker = boot({ fetchHandlers: handlers });
    expect(await worker.get('/api/notes')).toBeUndefined();
  });

  it('are never asked for a navigation, which stays the worker’s', async () => {
    const worker = boot({
      fetchHandlers: 'function onFetch() { return Promise.resolve(new Response("the app’s")); }',
    });
    const page = await worker.fire('fetch', { request: navigation('/notes') });
    expect(await page?.text()).toBe('network');
  });

  it('are not in the worker unless the app gives them', () => {
    expect(serviceWorkerSource({ version: '1' })).not.toContain('onFetch');
  });

  it('must be JavaScript text', () => {
    expect(() =>
      serviceWorkerSource({ version: '1', fetchHandlers: 1 as unknown as string }),
    ).toThrow('fetchHandlers must be JavaScript text');
  });
});
