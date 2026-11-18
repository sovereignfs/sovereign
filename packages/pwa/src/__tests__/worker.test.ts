import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { TAKE_OVER_MESSAGE } from '../message';
import { serviceWorkerResponse, serviceWorkerSource, type WorkerOptions } from '../worker';

/**
 * The worker is tested as the text a browser is sent: evaluated with a stand-in for what a worker is given (its events, its caches, the
 * network), and each request it may see put to it.
 */
const ORIGIN = 'https://notes.example.org';

type FakeRequest = { method: string; url: string; mode: string; headers: Headers };
type Handler = (event: unknown) => void;

class FakeCache {
  entries = new Map<string, Response>();
  match(request: FakeRequest | string) {
    const url = typeof request === 'string' ? request : request.url;
    return Promise.resolve(this.entries.get(url)?.clone());
  }
  put(request: FakeRequest | string, response: Response) {
    this.entries.set(typeof request === 'string' ? request : request.url, response);
    return Promise.resolve();
  }
}

function boot(options: Partial<WorkerOptions> = {}) {
  const handlers = new Map<string, Handler>();
  const stores = new Map<string, FakeCache>();
  const network = vi.fn<(request: FakeRequest) => Promise<Response>>();
  const skipWaiting = vi.fn();
  const claim = vi.fn(() => Promise.resolve());
  const caches = {
    open: (name: string) => {
      if (!stores.has(name)) stores.set(name, new FakeCache());
      return Promise.resolve(stores.get(name));
    },
    keys: () => Promise.resolve([...stores.keys()]),
    delete: (name: string) => Promise.resolve(stores.delete(name)),
  };
  vm.runInNewContext(serviceWorkerSource({ version: 'build-2', ...options }), {
    self: {
      location: { origin: ORIGIN },
      addEventListener: (type: string, handler: Handler) => handlers.set(type, handler),
      skipWaiting,
      clients: { claim },
    },
    caches,
    fetch: (request: FakeRequest) => network(request),
    Request: class {
      method = 'GET';
      mode = 'cors';
      headers = new Headers();
      constructor(public url: string) {}
    },
    Response,
    URL,
    Promise,
    setTimeout,
    clearTimeout,
  });
  return { handlers, stores, network, skipWaiting, claim };
}

const request = (
  path: string,
  init: { method?: string; mode?: string; headers?: Record<string, string> } = {},
): FakeRequest => ({
  method: init.method ?? 'GET',
  url: path.startsWith('http') ? path : `${ORIGIN}${path}`,
  mode: init.mode ?? 'no-cors',
  headers: new Headers(init.headers),
});

/** Puts a request to the worker: what it answered with, or undefined when it left it to the network. */
async function ask(
  worker: ReturnType<typeof boot>,
  req: FakeRequest,
): Promise<Response | undefined> {
  let answer: Promise<Response> | undefined;
  worker.handlers.get('fetch')?.({
    request: req,
    respondWith: (r: Promise<Response>) => (answer = r),
  });
  return answer ? await answer : undefined;
}

const ok = (body = 'x') => new Response(body, { status: 200 });

describe('what the worker keeps', () => {
  it.each([
    '/_next/static/chunks/app-3f2a.js',
    '/_next/static/css/1a2b.css',
    '/icons/icon-192.png',
    '/pwa-icon/512',
    '/manifest.webmanifest',
    '/favicon.ico',
  ])('keeps %s, the same for everyone', async (path) => {
    const worker = boot();
    worker.network.mockResolvedValue(Object.defineProperty(ok(), 'type', { value: 'basic' }));
    expect(await ask(worker, request(path))).toBeDefined();
  });

  it.each([
    ['a page', request('/notes')],
    ['an API answer', request('/api/notes')],
    ['a query string', request('/_next/static/a.js?token=abc')],
    [
      'an Authorization header',
      request('/_next/static/a.js', { headers: { authorization: 'Bearer x' } }),
    ],
    ['a POST', request('/_next/static/a.js', { method: 'POST' })],
    ['another site', request('https://elsewhere.example/_next/static/a.js')],
  ])('leaves %s to the network, untouched', async (_what, req) => {
    const worker = boot();
    expect(await ask(worker, req)).toBeUndefined();
    expect(worker.stores.size).toBe(0);
  });

  it('stores nothing that set a cookie, or that was not a plain 200', async () => {
    const worker = boot();
    worker.network.mockResolvedValue(
      Object.defineProperty(
        new Response('x', { status: 200, headers: { 'set-cookie': 'a=b' } }),
        'type',
        { value: 'basic' },
      ),
    );
    await ask(worker, request('/_next/static/a.js'));
    expect([...(worker.stores.values().next().value?.entries.keys() ?? [])]).toEqual([]);
  });

  it('refuses to be told to keep a page or an API, or to precache what is not on the allow-list', () => {
    expect(() => serviceWorkerSource({ version: '1', keep: ['/notes?x=1'] })).toThrow(TypeError);
    expect(() => serviceWorkerSource({ version: '1', precache: ['/notes'] })).toThrow('allow-list');
    expect(() => serviceWorkerSource({ version: '1', keep: ['//elsewhere.example/'] })).toThrow(
      TypeError,
    );
    expect(() => serviceWorkerSource({ version: "1'; evil()" })).toThrow(TypeError);
  });
});

describe('a navigation with no network', () => {
  it('is answered with a page of the worker’s own, with a policy that runs nothing', async () => {
    const worker = boot();
    worker.network.mockRejectedValue(new TypeError('offline'));
    const answer = await ask(worker, request('/notes', { mode: 'navigate' }));
    expect(answer?.status).toBe(503);
    expect(answer?.headers.get('content-security-policy')).toBe(
      "default-src 'none'; style-src 'unsafe-inline'",
    );
    expect(await answer?.text()).toContain('You’re offline');
  });

  it('is answered with the kept shell page when the app has one', async () => {
    const worker = boot({ shell: '/shell' });
    worker.network.mockResolvedValue(
      Object.defineProperty(ok('the shell'), 'type', { value: 'basic' }),
    );
    let installed: Promise<unknown> | undefined;
    worker.handlers.get('install')?.({ waitUntil: (p: Promise<unknown>) => (installed = p) });
    await installed;
    worker.network.mockRejectedValue(new TypeError('offline'));
    const answer = await ask(worker, request('/notes', { mode: 'navigate' }));
    expect(await answer?.text()).toBe('the shell');
  });

  it('goes to the network when there is one: a page is never answered from a cache', async () => {
    const worker = boot({ shell: '/shell' });
    worker.network.mockResolvedValue(ok('fresh page'));
    expect(await (await ask(worker, request('/notes', { mode: 'navigate' })))?.text()).toBe(
      'fresh page',
    );
  });
});

describe('the worker’s life', () => {
  it('keeps the shell and the build’s files when it installs, and nothing else', async () => {
    const worker = boot({ shell: '/shell', precache: ['/_next/static/a.js'] });
    worker.network.mockImplementation(() =>
      Promise.resolve(Object.defineProperty(ok(), 'type', { value: 'basic' })),
    );
    let installed: Promise<unknown> | undefined;
    worker.handlers.get('install')?.({ waitUntil: (p: Promise<unknown>) => (installed = p) });
    await installed;
    expect([...(worker.stores.get('sv-app-build-2')?.entries.keys() ?? [])].sort()).toEqual([
      `${ORIGIN}/_next/static/a.js`,
      `${ORIGIN}/shell`,
    ]);
  });

  it('waits until a page asks it to take over, and takes no other message', () => {
    const worker = boot();
    worker.handlers.get('message')?.({ data: 'anything' });
    expect(worker.skipWaiting).not.toHaveBeenCalled();
    worker.handlers.get('message')?.({ data: TAKE_OVER_MESSAGE });
    expect(worker.skipWaiting).toHaveBeenCalledOnce();
  });

  it('deletes its own old caches when it starts, and no one else’s', async () => {
    const worker = boot();
    for (const name of ['sv-app-build-1', 'sv-app-build-2', 'someone-else'])
      worker.stores.set(name, new FakeCache());
    let done: Promise<unknown> | undefined;
    worker.handlers.get('activate')?.({ waitUntil: (p: Promise<unknown>) => (done = p) });
    await done;
    expect([...worker.stores.keys()].sort()).toEqual(['someone-else', 'sv-app-build-2']);
    expect(worker.claim).toHaveBeenCalledOnce();
  });

  it('listens for nothing it does not need: no push, no sync', () => {
    expect([...boot().handlers.keys()].sort()).toEqual(['activate', 'fetch', 'install', 'message']);
  });

  it('reaches no other site', () => {
    const source = serviceWorkerSource({ version: '1' });
    expect(source).not.toMatch(/https?:\/\//);
    expect(source).not.toMatch(/importScripts|XMLHttpRequest|WebSocket|indexedDB|localStorage/);
  });
});

describe('/sw.js', () => {
  it('is script, fetched afresh every time, allowed to control the whole origin', () => {
    const response = serviceWorkerResponse('x');
    expect(response.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
    expect(response.headers.get('cache-control')).toBe('no-cache');
    expect(response.headers.get('service-worker-allowed')).toBe('/');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });
});
