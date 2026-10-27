import { describe, expect, it, vi } from 'vitest';
import { assertIdentifier, toNumber } from '../identifiers.js';
import { parseInt8, toPostgresPlaceholders } from '../postgres.js';
import { withTimeout } from '../timeout.js';
import {
  REQUEST_TIMEOUT_MS,
  assertNamespace,
  createNamespace,
  createSqldClient,
  dropNamespace,
} from '../sqld.js';

describe('assertIdentifier', () => {
  it('accepts a plain snake_case name', () => {
    expect(() => assertIdentifier('user_sessions')).not.toThrow();
  });

  it('accepts 63 bytes and refuses 64, which PostgreSQL would truncate', () => {
    expect(() => assertIdentifier('a'.repeat(63))).not.toThrow();
    expect(() => assertIdentifier('a'.repeat(64))).toThrow(/64 bytes/);
  });

  it('counts bytes, not characters', () => {
    expect(() => assertIdentifier('é'.repeat(32))).toThrow(/bytes/);
  });

  it.each(['Users', '1table', 'user-sessions', 'a b', '', 'drop;table'])('refuses %j', (name) => {
    expect(() => assertIdentifier(name)).toThrow();
  });
});

describe('toNumber', () => {
  it('turns what PostgreSQL returns into a number', () => {
    expect(toNumber('42')).toBe(42);
    expect(toNumber(42n)).toBe(42);
    expect(toNumber(7)).toBe(7);
    expect(toNumber('1761580000000')).toBe(1_761_580_000_000);
  });

  it('throws rather than lose digits', () => {
    expect(() => toNumber('9007199254740993')).toThrow(RangeError);
    expect(() => toNumber(9007199254740993n)).toThrow(RangeError);
    expect(() => toNumber(1.5)).toThrow(RangeError);
    expect(() => toNumber('')).toThrow(RangeError);
    expect(() => toNumber('abc')).toThrow(RangeError);
    expect(() => toNumber(null)).toThrow(RangeError);
  });
});

describe('parseInt8', () => {
  it('returns a number for what fits and throws for what does not', () => {
    expect(parseInt8('1761580000000')).toBe(1_761_580_000_000);
    expect(parseInt8('-5')).toBe(-5);
    expect(() => parseInt8('9007199254740993')).toThrow(RangeError);
  });
});

describe('toPostgresPlaceholders', () => {
  it('numbers the ? placeholders', () => {
    expect(toPostgresPlaceholders('select * from t where a = ? and b = ?')).toBe(
      'select * from t where a = $1 and b = $2',
    );
  });

  it('leaves a ? inside a quoted string or identifier alone', () => {
    expect(toPostgresPlaceholders('select \'?\', "a?b", ? from t')).toBe(
      'select \'?\', "a?b", $1 from t',
    );
  });

  it('copes with an escaped quote', () => {
    expect(toPostgresPlaceholders("select 'it''s ?', ?")).toBe("select 'it''s ?', $1");
  });

  it('keeps a cast attached', () => {
    expect(toPostgresPlaceholders('select pg_advisory_lock(?::bigint)')).toBe(
      'select pg_advisory_lock($1::bigint)',
    );
  });
});

describe('sqld namespaces', () => {
  it('accepts a name sqld takes and refuses the rest', () => {
    expect(() => assertNamespace('default')).not.toThrow();
    expect(() => assertNamespace('core_2')).not.toThrow();
    for (const bad of ['', 'Core', '2core', 'a-b', 'a/b', '../x', 'a'.repeat(64)]) {
      expect(() => assertNamespace(bad), bad).toThrow();
    }
  });

  // sqld takes the namespace from the first label of the Host header when no header is
  // sent, so http://127.0.0.1:8080 reads as "127" and answers 404.
  it.each(['default', 'core'])(
    'sends x-namespace on every request, for "%s" too',
    async (namespace) => {
      const seen: (string | null)[] = [];
      const fetchImpl = vi.fn((request: Request) => {
        seen.push(request.headers.get('x-namespace'));
        return Promise.resolve(new Response('{}', { status: 500 }));
      });
      const client = await createSqldClient('http://127.0.0.1:1', namespace, fetchImpl);
      await client.execute('select 1').catch(() => undefined);
      await client.execute('select 2').catch(() => undefined);
      client.close();
      expect(seen.length).toBeGreaterThanOrEqual(2);
      expect(new Set(seen)).toEqual(new Set([namespace]));
    },
  );

  it('keeps the headers a request already had', async () => {
    const seen: Headers[] = [];
    const fetchImpl = (request: Request) => {
      seen.push(request.headers);
      return Promise.resolve(new Response('{}', { status: 500 }));
    };
    const client = await createSqldClient('http://127.0.0.1:1', 'core', fetchImpl);
    await client.execute('select 1').catch(() => undefined);
    client.close();
    expect(seen[0]?.get('content-type')).toBeTruthy();
  });

  it('puts a time limit on every request, so one that never answers does not hang', async () => {
    // A server that accepts the request and never replies: it ends only when the signal aborts.
    // It deliberately keeps only the signal, not the Request: a collection in the middle of the
    // wait must not stop the timeout from arriving (it did, on a loaded CI runner, before the
    // client kept the Request reachable itself).
    const hangs = (request: Request) =>
      new Promise<Response>((_resolve, reject) => {
        request.signal.addEventListener('abort', () => reject(request.signal.reason as Error));
      });
    const client = await createSqldClient('http://127.0.0.1:1', 'core', hangs, 50);
    const started = Date.now();
    await expect(client.execute('select 1')).rejects.toThrow();
    client.close();
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it('allows a request thirty seconds by default', async () => {
    expect(REQUEST_TIMEOUT_MS).toBe(30_000);
    const seen: AbortSignal[] = [];
    const client = await createSqldClient('http://127.0.0.1:1', 'core', (request) => {
      seen.push(request.signal);
      return Promise.resolve(new Response('{}', { status: 500 }));
    });
    await client.execute('select 1').catch(() => undefined);
    client.close();
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((signal) => !signal.aborted)).toBe(true);
  });

  it('creates a namespace through the admin address, and a repeat counts as created', async () => {
    const calls: [string, string][] = [];
    const answers = [200, 400];
    const fetchImpl = vi.fn((url: string | URL | Request, init?: RequestInit) => {
      calls.push([String(url), init?.method ?? 'GET']);
      return Promise.resolve(new Response('', { status: answers.shift() ?? 200 }));
    }) as unknown as typeof fetch;
    await createNamespace('http://sqld:8081/', 'core', fetchImpl);
    await createNamespace('http://sqld:8081', 'core', fetchImpl);
    expect(calls).toEqual([
      ['http://sqld:8081/v1/namespaces/core/create', 'POST'],
      ['http://sqld:8081/v1/namespaces/core/create', 'POST'],
    ]);
  });

  it('fails on any other answer, and drops a namespace that is already gone without complaint', async () => {
    const answer = (status: number) =>
      (() => Promise.resolve(new Response('', { status }))) as unknown as typeof fetch;
    await expect(createNamespace('http://sqld:8081', 'core', answer(500))).rejects.toThrow(/500/);
    await expect(dropNamespace('http://sqld:8081', 'core', answer(404))).resolves.toBeUndefined();
    await expect(dropNamespace('http://sqld:8081', 'core', answer(500))).rejects.toThrow(/500/);
  });

  it('refuses a namespace that would reach another admin path', async () => {
    await expect(createNamespace('http://sqld:8081', '../x')).rejects.toThrow(/namespace/i);
  });
});

describe('withTimeout', () => {
  it('passes the result through when the work is quick', async () => {
    await expect(withTimeout(Promise.resolve(7), 1000, 'The thing')).resolves.toBe(7);
  });

  it('rejects, naming what took too long, when it is not', async () => {
    const never = new Promise<number>(() => undefined);
    await expect(withTimeout(never, 20, 'The database check')).rejects.toThrow(
      'The database check took longer than 20 ms',
    );
  });

  it('passes a failure through unchanged', async () => {
    await expect(withTimeout(Promise.reject(new Error('nope')), 1000, 'x')).rejects.toThrow('nope');
  });
});
