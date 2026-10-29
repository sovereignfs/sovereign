import vm from 'node:vm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CACHE_LIMIT,
  CACHE_NAME,
  NAVIGATION_TIMEOUT_MS,
  SERVICE_WORKER_SOURCE,
} from '../sw/source';

/**
 * The service worker is tested as the text a browser is sent: it is evaluated here with a stand-in for what a worker
 * is given (its events, a cache, the network), and each request it may see is put to it.
 */
const ORIGIN = 'https://core.example.com';

type Handler = (event: unknown) => void;
type FakeRequest = {
  method: string;
  url: string;
  mode: string;
  headers: Headers;
};

class FakeCache {
  entries = new Map<string, Response>();
  match(request: FakeRequest) {
    return Promise.resolve(this.entries.get(request.url)?.clone());
  }
  put(request: FakeRequest, response: Response) {
    this.entries.delete(request.url);
    this.entries.set(request.url, response);
    return Promise.resolve();
  }
  keys() {
    return Promise.resolve([...this.entries.keys()].map((url) => ({ url })));
  }
  delete(request: { url: string }) {
    return Promise.resolve(this.entries.delete(request.url));
  }
}

function boot() {
  const handlers = new Map<string, Handler>();
  const stores = new Map<string, FakeCache>();
  const network = vi.fn<(request: FakeRequest) => Promise<Response>>();
  const claim = vi.fn(() => Promise.resolve());
  const skipWaiting = vi.fn();
  const caches = {
    open: (name: string) => {
      if (!stores.has(name)) stores.set(name, new FakeCache());
      return Promise.resolve(stores.get(name));
    },
    keys: () => Promise.resolve([...stores.keys()]),
    delete: (name: string) => Promise.resolve(stores.delete(name)),
  };
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, handler: Handler) => handlers.set(type, handler),
    clients: { claim },
    skipWaiting,
  };
  vm.runInNewContext(SERVICE_WORKER_SOURCE, {
    self,
    caches,
    fetch: (request: FakeRequest) => network(request),
    Response,
    URL,
    Promise,
    setTimeout,
    clearTimeout,
  });
  return { handlers, stores, network, claim, skipWaiting };
}

const request = (
  url: string,
  init: { method?: string; mode?: string; headers?: Record<string, string> } = {},
): FakeRequest => ({
  method: init.method ?? 'GET',
  url: url.startsWith('http') ? url : `${ORIGIN}${url}`,
  mode: init.mode ?? 'no-cors',
  headers: new Headers(init.headers),
});

/** Puts a request to the worker; what it answered with, or `undefined` when it did not handle it. */
async function ask(worker: ReturnType<typeof boot>, req: FakeRequest) {
  let answer: Promise<Response> | undefined;
  worker.handlers.get('fetch')?.({
    request: req,
    respondWith: (promise: Promise<Response>) => {
      answer = promise;
    },
  });
  return answer ? await answer : undefined;
}

/** What the network answers for a same-origin file: a response of the kind a worker is given for one (`basic`). */
const basic = (body: string | null, init: ResponseInit = { status: 200 }) => {
  const response = new Response(body, init);
  Object.defineProperty(response, 'type', { value: 'basic' });
  return response;
};
const asset = () => basic('body{}');
const KEPT = [
  '/_next/static/chunks/app-1a2b3c.js',
  '/_next/static/css/app-9f8e7d.css',
  '/_next/static/media/hanken-grotesk-latin-wght-normal.3241148m1u9do.woff2',
  '/icons/favicon.svg',
  '/icons/icon-192.png',
];

describe('the service worker: what it keeps', () => {
  let worker: ReturnType<typeof boot>;
  beforeEach(() => {
    worker = boot();
    worker.network.mockImplementation(() => Promise.resolve(asset()));
  });

  it.each(KEPT)('keeps %s: fetched once, then read from its cache', async (path) => {
    expect(await ask(worker, request(path))).toBeDefined();
    expect(worker.network).toHaveBeenCalledTimes(1);
    expect(await ask(worker, request(path))).toBeDefined();
    expect(worker.network).toHaveBeenCalledTimes(1);
    expect([...(worker.stores.get(CACHE_NAME)?.entries.keys() ?? [])]).toEqual([
      `${ORIGIN}${path}`,
    ]);
  });

  it.each([
    ['a page', '/profile', {}],
    ['the launcher', '/', {}],
    ['a Console page', '/console/accounts', {}],
    ['the consent page', '/consent?client_id=abc', {}],
    ['a call to the API', '/api/v1/directory/users?q=ada', {}],
    ['better-auth', '/api/auth/get-session', {}],
    ['a discovery document', '/.well-known/openid-configuration', {}],
    ['a person’s picture', '/api/avatars/u1?v=3', {}],
    ['the manifest', '/manifest.webmanifest', {}],
    ['the worker itself', '/sw.js', {}],
    ['a built file with a query string', '/_next/static/chunks/a.js?token=abc', {}],
    ['a path that only looks like a built file', '/x/_next/static/a.js', {}],
    ['a built file with the wrong prefix', '/_next/static', {}],
    ['a built file that is not under static', '/_next/data/build/index.json', {}],
    ['a file of another origin', 'https://cdn.example.com/_next/static/a.js', {}],
    [
      'a request with credentials of its own',
      '/icons/favicon.svg',
      { headers: { authorization: 'Bearer x' } },
    ],
    ['a POST', '/icons/favicon.svg', { method: 'POST' }],
    ['a PUT to a built path', '/_next/static/a.js', { method: 'PUT' }],
  ])('does not handle %s: the browser goes to the network', async (_name, path, init) => {
    expect(await ask(worker, request(path, init))).toBeUndefined();
    expect(worker.network).not.toHaveBeenCalled();
    expect(worker.stores.get(CACHE_NAME)?.entries.size ?? 0).toBe(0);
  });

  it.each([
    ['an error', basic('no', { status: 500 })],
    ['a missing file', basic('no', { status: 404 })],
    ['a redirect', basic(null, { status: 302, headers: { location: '/sign-in' } })],
    ['an answer that sets a cookie', basic('x', { status: 200, headers: { 'set-cookie': 'a=b' } })],
    ['an answer that is not the site’s own', new Response('x', { status: 200 })],
  ])('answers with %s but does not keep it', async (_name, response) => {
    worker.network.mockResolvedValue(response);
    expect(await ask(worker, request('/_next/static/chunks/a.js'))).toBeDefined();
    expect(worker.stores.get(CACHE_NAME)?.entries.size ?? 0).toBe(0);
  });

  it('never holds more than its limit, dropping the oldest first', async () => {
    for (let at = 0; at < CACHE_LIMIT + 5; at++) {
      await ask(worker, request(`/_next/static/chunks/f-${at}.js`));
      // The trimming runs after the answer; let it finish.
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    const kept = [...(worker.stores.get(CACHE_NAME)?.entries.keys() ?? [])];
    expect(kept).toHaveLength(CACHE_LIMIT);
    expect(kept).not.toContain(`${ORIGIN}/_next/static/chunks/f-0.js`);
    expect(kept).toContain(`${ORIGIN}/_next/static/chunks/f-${CACHE_LIMIT + 4}.js`);
  });
});

describe('the service worker: a page that cannot be reached', () => {
  let worker: ReturnType<typeof boot>;
  beforeEach(() => {
    worker = boot();
  });
  const navigation = (path = '/profile') => request(path, { mode: 'navigate' });

  it('passes a page through untouched when the network answers, and keeps nothing of it', async () => {
    worker.network.mockResolvedValue(new Response('<h1>Ada’s account</h1>', { status: 200 }));
    const response = await ask(worker, navigation());
    expect(await response?.text()).toBe('<h1>Ada’s account</h1>');
    expect(worker.stores.size).toBe(0);
  });

  it('answers with a page of its own when the network is down', async () => {
    worker.network.mockRejectedValue(new TypeError('Failed to fetch'));
    const response = await ask(worker, navigation('/console/accounts/u1'));
    expect(response?.status).toBe(503);
    const html = (await response?.text()) ?? '';
    expect(html).toContain('You’re offline');
    expect(html).toContain('Try again');
    // It says nothing of where the person was going, who they are, or which instance this is.
    expect(html).not.toMatch(/console|accounts|u1|Sovereign/i);
    expect(response?.headers.get('content-type')).toContain('text/html');
    // It needs no script, and the policy says so: nothing runs, only its own style.
    expect(html).not.toMatch(/<script|<link|<img|<iframe|\son\w+=/i);
    expect(response?.headers.get('content-security-policy')).toBe(
      "default-src 'none'; style-src 'unsafe-inline'",
    );
    expect(response?.headers.get('cache-control')).toBe('no-store');
    expect(worker.stores.size).toBe(0);
  });

  it('answers the same way when the server does not answer in time', async () => {
    vi.useFakeTimers();
    try {
      worker = boot();
      worker.network.mockReturnValue(new Promise(() => undefined));
      const pending = ask(worker, navigation());
      await vi.advanceTimersByTimeAsync(NAVIGATION_TIMEOUT_MS + 1);
      expect((await pending)?.status).toBe(503);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not answer with the offline page when the server answered, even with an error', async () => {
    worker.network.mockResolvedValue(new Response('broken', { status: 500 }));
    expect((await ask(worker, navigation()))?.status).toBe(500);
  });

  it('is not tricked by a page whose address looks like a kept file', async () => {
    worker.network.mockResolvedValue(new Response('page', { status: 200 }));
    await ask(worker, request('/icons/favicon.svg', { mode: 'navigate' }));
    expect(worker.stores.size).toBe(0);
  });
});

describe('the service worker: its life', () => {
  it('takes over at once, since it holds nothing a swap could break', async () => {
    const worker = boot();
    worker.handlers.get('install')?.({});
    expect(worker.skipWaiting).toHaveBeenCalledTimes(1);
    let done: Promise<unknown> | undefined;
    worker.handlers.get('activate')?.({
      waitUntil: (promise: Promise<unknown>) => (done = promise),
    });
    await done;
    expect(worker.claim).toHaveBeenCalledTimes(1);
  });

  it('deletes every cache but its own current one when it starts', async () => {
    const worker = boot();
    await await worker.stores.get('sv-static-0');
    worker.stores.set('sv-static-0', new FakeCache());
    worker.stores.set(CACHE_NAME, new FakeCache());
    worker.stores.set('something-else', new FakeCache());
    let done: Promise<unknown> | undefined;
    worker.handlers.get('activate')?.({
      waitUntil: (promise: Promise<unknown>) => (done = promise),
    });
    await done;
    expect([...worker.stores.keys()]).toEqual([CACHE_NAME]);
  });

  it('has no handler for anything it does not need: no push, no sync, no message', () => {
    expect([...boot().handlers.keys()].sort()).toEqual(['activate', 'fetch', 'install']);
  });

  it('reaches no other site: it names no address but its own', () => {
    expect(SERVICE_WORKER_SOURCE).not.toMatch(/https?:\/\//);
    expect(SERVICE_WORKER_SOURCE).not.toMatch(
      /importScripts|XMLHttpRequest|WebSocket|sendBeacon|indexedDB|localStorage/,
    );
  });
});
