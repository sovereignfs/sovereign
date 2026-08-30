import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runWithBackgroundPlugin } from '../background-plugin-context';

const listStorageObjects = vi.fn();
const getPlatformDb = vi.fn();

const PLATFORM_CLIENT = 'platform-db-marker';

vi.mock('@sovereignfs/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sovereignfs/db')>();
  return {
    ...actual,
    listStorageObjects: (...args: unknown[]) => {
      listStorageObjects(...args);
      return Promise.resolve([]);
    },
  };
});

vi.mock('../db', () => ({
  getPlatformDb: () => {
    getPlatformDb();
    return Promise.resolve({ db: PLATFORM_CLIENT });
  },
}));

let headerPluginId: string | null = null;
vi.mock('next/headers', () => ({
  headers: () =>
    Promise.resolve({
      get: (name: string) => (name === 'x-sovereign-plugin-id' ? headerPluginId : null),
    }),
}));

/**
 * Regression coverage for the `sdk.storage` background-invocation gap found
 * building `sovereign-plugin-travellog`'s Swarm import job (T.8): a job
 * handler has no real Next.js request, so `next/headers()` throws —
 * `storageContext()` (`packages/sdk/src/storage.ts`) now catches that and
 * passes `pluginId: null` through instead of throwing itself, and
 * `sdk-host.ts`'s `resolveStorageContext` falls back to the same
 * background-plugin `AsyncLocalStorage` context `db.getClient` already used
 * (`sdk-host-db-routing.test.ts` is this file's direct sibling — mirrors
 * its mocking approach, scoped to `storage.list` as the simplest of the
 * five storage methods that all now share `resolveStorageContext`).
 */
const sdkHostModule = await import('@sovereignfs/sdk');
await import('../sdk-host');

async function listAs(pluginId: string | null) {
  headerPluginId = pluginId;
  return sdkHostModule.sdk.storage.list();
}

beforeEach(() => {
  vi.clearAllMocks();
  headerPluginId = null;
});

describe('sdk-host storage.list — plugin id routing', () => {
  it('resolves the plugin id from the request header inside a real request', async () => {
    await listAs('fs.example.widget');
    expect(listStorageObjects).toHaveBeenCalledWith(
      { db: PLATFORM_CLIENT },
      { tenantId: 'default', pluginId: 'fs.example.widget', userId: null },
      undefined,
      undefined,
    );
  });

  it('throws when no request header and no background context are present', async () => {
    await expect(listAs(null)).rejects.toThrow(/plugin route context/);
    expect(listStorageObjects).not.toHaveBeenCalled();
  });

  it('falls back to the background-invocation plugin context when running inside a job/schedule handler (no request header)', async () => {
    await runWithBackgroundPlugin('fs.example.widget', () => listAs(null));
    expect(listStorageObjects).toHaveBeenCalledWith(
      { db: PLATFORM_CLIENT },
      { tenantId: 'default', pluginId: 'fs.example.widget', userId: null },
      undefined,
      undefined,
    );
  });

  it('prefers the request header over the background context when both are present', async () => {
    await runWithBackgroundPlugin('fs.example.background', () => listAs('fs.example.request'));
    expect(listStorageObjects).toHaveBeenCalledWith(
      { db: PLATFORM_CLIENT },
      { tenantId: 'default', pluginId: 'fs.example.request', userId: null },
      undefined,
      undefined,
    );
  });

  it('clamps a caller-supplied limit above 500 before reaching listStorageObjects', async () => {
    headerPluginId = 'fs.example.widget';
    await sdkHostModule.sdk.storage.list(undefined, { limit: 10_000, offset: 20 });
    expect(listStorageObjects).toHaveBeenCalledWith(
      { db: PLATFORM_CLIENT },
      { tenantId: 'default', pluginId: 'fs.example.widget', userId: null },
      undefined,
      { limit: 500, offset: 20 },
    );
  });
});
