import { describe, expect, it, vi } from 'vitest';
import { CoreApiError, createCoreClient } from '../index';

type Call = { url: URL; init: RequestInit };
const fake = (reply: () => Response) => {
  const calls: Call[] = [];
  const fetch = vi.fn((url: URL | string, init: RequestInit) => {
    calls.push({ url: new URL(String(url)), init });
    return Promise.resolve(reply());
  });
  return { calls, fetch: fetch as unknown as typeof globalThis.fetch };
};
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
const headersOf = (call: Call | undefined) => (call?.init.headers ?? {}) as Record<string, string>;

describe('calling an operation', () => {
  it('sends the method and address the contract gives, with the query, and the token as a bearer', async () => {
    const { calls, fetch } = fake(() => json({ users: [] }));
    const core = createCoreClient({ baseUrl: 'https://core.example.com', token: 'tok', fetch });
    expect(await core.searchDirectoryUsers({ query: { q: 'ada', limit: 5 } })).toEqual({
      users: [],
    });
    expect(calls[0]?.init.method).toBe('GET');
    expect(calls[0]?.url.toString()).toBe(
      'https://core.example.com/api/v1/directory/users?q=ada&limit=5',
    );
    expect(headersOf(calls[0]).authorization).toBe('Bearer tok');
    expect(headersOf(calls[0]).accept).toBe('application/json');
  });

  it('leaves out a query value that was not given, and encodes one that was', async () => {
    const { calls, fetch } = fake(() => json({ users: [] }));
    const core = createCoreClient({ baseUrl: 'https://core.example.com', token: 'tok', fetch });
    await core.searchDirectoryUsers({ query: { q: 'a&b=c d' } });
    expect(calls[0]?.url.search).toBe('?q=a%26b%3Dc+d');
  });

  it('sends a JSON body with its type, for an operation that takes one', async () => {
    const { calls, fetch } = fake(() => json({ users: [] }));
    const core = createCoreClient({ baseUrl: 'https://core.example.com', token: 'tok', fetch });
    await core.resolveDirectoryUsers({ body: { subs: ['a', 'b'] } });
    expect(calls[0]?.init.method).toBe('POST');
    expect(calls[0]?.init.body).toBe('{"subs":["a","b"]}');
    expect(headersOf(calls[0])['content-type']).toBe('application/json');
  });

  it('sends no token to a public operation, and needs none', async () => {
    const { calls, fetch } = fake(() =>
      json({
        name: 'Acme',
        url: 'https://core.example.com',
        logo: { light: null, dark: null },
        favicon: null,
      }),
    );
    const core = createCoreClient({ baseUrl: 'https://core.example.com', fetch });
    expect((await core.getInstanceBranding()).name).toBe('Acme');
    expect(calls[0]?.url.pathname).toBe('/.well-known/sovereign-instance');
    expect(headersOf(calls[0]).authorization).toBeUndefined();
  });

  it('refuses, before it asks, an operation that needs a token when it has none', async () => {
    const { calls, fetch } = fake(() => json({}));
    const core = createCoreClient({ baseUrl: 'https://core.example.com', fetch });
    await expect(core.searchDirectoryUsers({ query: { q: 'a' } })).rejects.toThrow(
      /needs an access token/,
    );
    expect(calls).toHaveLength(0);
  });

  it('asks a token function each time, so a refreshed token is the one used', async () => {
    const { calls, fetch } = fake(() => json({ users: [] }));
    let n = 0;
    const core = createCoreClient({
      baseUrl: 'https://core.example.com',
      token: () => `t${++n}`,
      fetch,
    });
    await core.searchDirectoryUsers({ query: { q: 'a' } });
    await core.searchDirectoryUsers({ query: { q: 'a' } });
    expect(calls.map((call) => headersOf(call).authorization)).toEqual(['Bearer t1', 'Bearer t2']);
  });

  it('puts a path at the instance’s origin whatever path the base address had', async () => {
    const { calls, fetch } = fake(() => json({ users: [] }));
    const core = createCoreClient({
      baseUrl: 'https://core.example.com/ignored/',
      token: 't',
      fetch,
    });
    await core.searchDirectoryUsers({ query: { q: 'a' } });
    expect(calls[0]?.url.pathname).toBe('/api/v1/directory/users');
  });
});

describe('when Core refuses', () => {
  const fails = async (reply: Response) => {
    const { fetch } = fake(() => reply);
    const core = createCoreClient({ baseUrl: 'https://core.example.com', token: 't', fetch });
    return core.searchDirectoryUsers({ query: { q: 'a' } }).catch((error: unknown) => error);
  };

  it('throws the contract’s error, with the status', async () => {
    const error = await fails(json({ error: 'insufficient_scope', message: 'No.' }, 403));
    expect(error).toBeInstanceOf(CoreApiError);
    expect(error).toMatchObject({ status: 403, code: 'insufficient_scope', message: 'No.' });
  });

  it('says how long to wait when it is asked to slow down', async () => {
    const error = await fails(
      json({ error: 'rate_limited', message: 'Slow down.' }, 429, { 'retry-after': '17' }),
    );
    expect(error).toMatchObject({ status: 429, code: 'rate_limited', retryAfter: 17 });
  });

  it('keeps the status when the answer is not one Core gives', async () => {
    const error = await fails(new Response('<html>bad gateway</html>', { status: 502 }));
    expect(error).toMatchObject({ status: 502, code: 'unknown', message: 'Core answered 502.' });
  });

  it('offers a wait only for a 429', async () => {
    const error = await fails(
      json({ error: 'invalid_token', message: 'x' }, 401, { 'retry-after': '5' }),
    );
    expect((error as CoreApiError).retryAfter).toBeUndefined();
  });
});
