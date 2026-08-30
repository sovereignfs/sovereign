import { beforeEach, describe, expect, it, vi } from 'vitest';

const getConsentGrant = vi.fn();
const logDataAccess = vi.fn();
const getPlatformDb = vi.fn();

const PLATFORM_CLIENT = 'platform-db-marker';

vi.mock('@sovereignfs/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sovereignfs/db')>();
  return {
    ...actual,
    getConsentGrant: (...args: unknown[]) => getConsentGrant(...args),
    logDataAccess: (...args: unknown[]) => {
      logDataAccess(...args);
      return Promise.resolve();
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
      get: (name: string) => {
        if (name === 'x-sovereign-plugin-id') return headerPluginId;
        if (name === 'x-sovereign-user-id') return headerPluginId ? 'user-1' : null;
        return null;
      },
    }),
}));

/**
 * Regression coverage for a codebase-audit finding: `_resolverRegistry`
 * (`sdk-host.ts`) used to be keyed by bare contract name only, so two
 * unrelated plugins picking the same local contract name (e.g. both naming
 * one `"expenses"`) silently clobbered each other's registration — a
 * consumer holding a valid consent grant for provider A could be served
 * provider B's resolver. Fixed by namespacing the registry
 * `<providerId>:<contract>` (`pluginContractName`), mirroring how
 * `_toolRegistry`/`sdk.tools` already avoided this class of collision.
 */
const sdkHostModule = await import('@sovereignfs/sdk');
await import('../sdk-host');

beforeEach(() => {
  vi.clearAllMocks();
  headerPluginId = null;
  getConsentGrant.mockResolvedValue({ id: 'grant-1' });
});

async function provideAs(pluginId: string, contract: string, rows: unknown[]) {
  headerPluginId = pluginId;
  await sdkHostModule.sdk.data.provide(contract, async () => rows);
}

async function queryAs(consumerPluginId: string, providerId: string, contract: string) {
  headerPluginId = consumerPluginId;
  return sdkHostModule.sdk.data.query({ providerId, contract, version: 1 }, {});
}

describe('sdk-host sdk.data — cross-plugin contract isolation', () => {
  it('two providers registering the identical local contract name resolve independently', async () => {
    await provideAs('com.example.finance', 'expenses', [{ from: 'finance' }]);
    await provideAs('com.example.ledger', 'expenses', [{ from: 'ledger' }]);

    await expect(
      queryAs('com.example.consumer', 'com.example.finance', 'expenses'),
    ).resolves.toEqual([{ from: 'finance' }]);
    await expect(
      queryAs('com.example.consumer', 'com.example.ledger', 'expenses'),
    ).resolves.toEqual([{ from: 'ledger' }]);
  });

  it("a consumer with a grant for provider A never receives provider B's data, even under a name collision", async () => {
    await provideAs('com.example.finance', 'expenses', [{ secret: 'finance-only' }]);
    await provideAs('com.example.ledger', 'expenses', [{ secret: 'ledger-only' }]);

    const financeRows = await queryAs('com.example.consumer', 'com.example.finance', 'expenses');
    expect(financeRows).not.toContainEqual({ secret: 'ledger-only' });
    expect(financeRows).toEqual([{ secret: 'finance-only' }]);
  });

  it("registering under a new providerId does not overwrite a different provider's prior registration", async () => {
    await provideAs('com.example.finance', 'expenses', [{ v: 1 }]);
    await provideAs('com.example.ledger', 'expenses', [{ v: 2 }]);
    // Re-registering finance's own contract only replaces finance's own entry.
    await provideAs('com.example.finance', 'expenses', [{ v: 3 }]);

    await expect(
      queryAs('com.example.consumer', 'com.example.finance', 'expenses'),
    ).resolves.toEqual([{ v: 3 }]);
    await expect(
      queryAs('com.example.consumer', 'com.example.ledger', 'expenses'),
    ).resolves.toEqual([{ v: 2 }]);
  });
});
