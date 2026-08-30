import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runWithPortabilityPlugin } from '../portability/plugin-context';

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
let headerUserId: string | null = null;
vi.mock('next/headers', () => ({
  headers: () =>
    Promise.resolve({
      get: (name: string) => {
        if (name === 'x-sovereign-plugin-id') return headerPluginId;
        if (name === 'x-sovereign-user-id') return headerUserId;
        return null;
      },
    }),
}));

/**
 * Regression coverage for the `sdk.storage` portability-resolver
 * user-id gap found building `sovereign-plugin-travellog`'s T.23 (portability
 * hooks): `resolveStorageContext` (`sdk-host.ts`) already fell back
 * `pluginId` to `getPortabilityPluginContext()` for an export/import
 * resolver (no real request, so `storageContext()` never sees
 * `x-sovereign-user-id` either) — but `userId` had no equivalent fallback,
 * so it always resolved to `null`. `canAccessStorageObject` denies whenever
 * a stored object's `ownerUserId` is set and the reading context's `userId`
 * doesn't match — including `null` — so an export resolver reading back a
 * user-owned object (e.g. Travellog's visit photos) via `sdk.storage.get()`
 * silently got denied, with no error surfaced. Mirrors
 * `sdk-host-storage-routing.test.ts`'s mocking approach (that file covers
 * the sibling background-job/schedule gap, which never carries a userId at
 * all); scoped to `storage.list` as the simplest of the five storage
 * methods that all share `resolveStorageContext`.
 */
const sdkHostModule = await import('@sovereignfs/sdk');
await import('../sdk-host');

async function listAs(pluginId: string | null, userId: string | null) {
  headerPluginId = pluginId;
  headerUserId = userId;
  return sdkHostModule.sdk.storage.list();
}

beforeEach(() => {
  vi.clearAllMocks();
  headerPluginId = null;
  headerUserId = null;
});

describe('sdk-host storage.list — portability context user id routing', () => {
  it('resolves both plugin id and user id from request headers inside a real request', async () => {
    await listAs('fs.example.widget', 'user-1');
    expect(listStorageObjects).toHaveBeenCalledWith(
      { db: PLATFORM_CLIENT },
      { tenantId: 'default', pluginId: 'fs.example.widget', userId: 'user-1' },
      undefined,
      undefined,
    );
  });

  it('falls back to the portability context for both plugin id and user id when running inside an export/import resolver (no request)', async () => {
    await runWithPortabilityPlugin('fs.example.widget', 'user-1', () => listAs(null, null));
    expect(listStorageObjects).toHaveBeenCalledWith(
      { db: PLATFORM_CLIENT },
      { tenantId: 'default', pluginId: 'fs.example.widget', userId: 'user-1' },
      undefined,
      undefined,
    );
  });

  it('resolves a null portability user id (no user scoped to this run) as null, not as a resolver crash', async () => {
    await runWithPortabilityPlugin('fs.example.widget', null, () => listAs(null, null));
    expect(listStorageObjects).toHaveBeenCalledWith(
      { db: PLATFORM_CLIENT },
      { tenantId: 'default', pluginId: 'fs.example.widget', userId: null },
      undefined,
      undefined,
    );
  });

  it('prefers the request header over the portability context when both are present', async () => {
    await runWithPortabilityPlugin('fs.example.background', 'user-background', () =>
      listAs('fs.example.request', 'user-request'),
    );
    expect(listStorageObjects).toHaveBeenCalledWith(
      { db: PLATFORM_CLIENT },
      { tenantId: 'default', pluginId: 'fs.example.request', userId: 'user-request' },
      undefined,
      undefined,
    );
  });
});
