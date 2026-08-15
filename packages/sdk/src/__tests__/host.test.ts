import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The host is stored on a `Symbol.for`-keyed global (see host.ts's own doc
 * comment on why: separate Next.js bundles must share one registration).
 * That means state persists across tests unless explicitly cleared —
 * `vi.resetModules()` alone does not reset `globalThis`.
 */
function clearRegisteredHost(): void {
  const key = Symbol.for('@sovereignfs/sdk:host');
  Reflect.deleteProperty(globalThis as Record<symbol, unknown>, key);
}

beforeEach(() => {
  vi.resetModules();
  clearRegisteredHost();
});

describe('requireHost — missing host throws a useful error', () => {
  it('throws, naming the runtime and how to start it, when no host is registered', async () => {
    const { requireHost } = await import('../host');

    expect(() => requireHost()).toThrow(/no runtime host is registered/i);
    try {
      requireHost();
      throw new Error('expected requireHost() to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      const message = (err as Error).message;
      // Actionable for a plugin developer hitting this outside the runtime —
      // not just "no host", but what to actually do about it.
      expect(message).toMatch(/pnpm dev/);
      expect(message).toMatch(/plugin is installed/i);
    }
  });

  it('a call through a plugin-facing SDK function that reaches the host surfaces the same error', async () => {
    // packages/sdk/src/db.ts's getClient() calls requireHost() internally —
    // this is what a plugin actually experiences when the SDK is imported
    // outside a running Sovereign instance (e.g. a unit test that forgets to
    // mock @sovereignfs/sdk), not just a direct call to the internal function.
    vi.doMock('next/headers', () => ({
      headers: () => Promise.resolve({ get: () => null }),
    }));
    const { getClient } = await import('../db');

    await expect(getClient()).rejects.toThrow(/no runtime host is registered/i);
  });
});

describe('requireHost — returns the registered host after provideHost()', () => {
  it('returns the exact host object passed to provideHost()', async () => {
    const { provideHost, requireHost } = await import('../host');
    const fakeHost = { db: { getClient: vi.fn() } } as unknown as Parameters<typeof provideHost>[0];

    provideHost(fakeHost);

    expect(requireHost()).toBe(fakeHost);
  });

  it('the registration survives a fresh module import (Symbol.for-keyed global, not per-module state)', async () => {
    const { provideHost } = await import('../host');
    const fakeHost = { db: { getClient: vi.fn() } } as unknown as Parameters<typeof provideHost>[0];
    provideHost(fakeHost);

    vi.resetModules();
    const { requireHost: requireHostAgain } = await import('../host');

    expect(requireHostAgain()).toBe(fakeHost);
  });
});
