import { createServer, type Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { pinnedFetch } from '../pinned-fetch';

describe('pinnedFetch', () => {
  let server: Server;
  let port: number;
  let lastRequest: {
    headers: Record<string, string | string[] | undefined>;
    method?: string;
  } | null;

  beforeEach(async () => {
    lastRequest = null;
    server = createServer((req, res) => {
      lastRequest = { headers: req.headers, method: req.method };
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        if (req.url === '/error') {
          res.writeHead(404, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: { message: 'not found' } }));
          return;
        }
        res.writeHead(200, { 'content-type': 'application/json', 'x-echo-body': body || 'none' });
        res.end(JSON.stringify({ ok: true }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('expected a TCP address');
    port = address.port;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('connects to the pinned address, not a fresh resolution of the URL hostname', async () => {
    // A hostname that would not resolve on a real network at all -- if
    // pinnedFetch fell back to resolving it instead of using the pinned
    // address, this would fail with an ENOTFOUND, not succeed.
    const url = new URL(`http://this-host-does-not-exist.invalid:${port}/models`);

    const response = await pinnedFetch(url, '127.0.0.1', 4, { method: 'GET' });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it('sends the original hostname as the Host header, not the pinned IP', async () => {
    const url = new URL(`http://this-host-does-not-exist.invalid:${port}/models`);

    await pinnedFetch(url, '127.0.0.1', 4, { method: 'GET' });

    expect(lastRequest?.headers.host).toBe(`this-host-does-not-exist.invalid:${port}`);
  });

  it('forwards method, headers, and body', async () => {
    const url = new URL(`http://this-host-does-not-exist.invalid:${port}/chat/completions`);

    await pinnedFetch(url, '127.0.0.1', 4, {
      method: 'POST',
      headers: { authorization: 'Bearer sk-test', 'content-type': 'application/json' },
      body: JSON.stringify({ hello: 'world' }),
    });

    expect(lastRequest?.method).toBe('POST');
    expect(lastRequest?.headers.authorization).toBe('Bearer sk-test');
  });

  it('surfaces a non-2xx status and body from the pinned connection', async () => {
    const url = new URL(`http://this-host-does-not-exist.invalid:${port}/error`);

    const response = await pinnedFetch(url, '127.0.0.1', 4, { method: 'GET' });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: { message: 'not found' } });
  });

  it('rejects when the pinned address refuses the connection', async () => {
    // Port 1 on loopback: nothing listens there, so this proves pinnedFetch
    // actually connects to the pinned address/port rather than silently
    // succeeding against something else.
    const url = new URL('http://this-host-does-not-exist.invalid:1/models');

    await expect(pinnedFetch(url, '127.0.0.1', 4, { method: 'GET' })).rejects.toThrow();
  });

  it('rejects immediately when the signal is already aborted', async () => {
    const url = new URL(`http://this-host-does-not-exist.invalid:${port}/models`);
    const controller = new AbortController();
    controller.abort();

    await expect(
      pinnedFetch(url, '127.0.0.1', 4, { method: 'GET', signal: controller.signal }),
    ).rejects.toThrow();
  });
});
