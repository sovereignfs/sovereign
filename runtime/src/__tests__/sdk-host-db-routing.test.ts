import { beforeEach, describe, expect, it, vi } from 'vitest';

const provisionPluginDb = vi.fn();
const getPluginDb = vi.fn();
const getPlatformDb = vi.fn();

// sdk-host.ts's real code does `(await getPlatformDb()).db` and
// `getPluginDb(id).db` — both host functions return a wrapper object whose
// `.db` property is the actual Drizzle client, not the client itself.
const PLATFORM_CLIENT = 'platform-db-marker';
const PLUGIN_CLIENT = 'plugin-db-marker';

vi.mock('@sovereignfs/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sovereignfs/db')>();
  return {
    ...actual,
    provisionPluginDb: (...args: unknown[]) => provisionPluginDb(...args),
    getPluginDb: (...args: unknown[]) => {
      getPluginDb(...args);
      return { db: PLUGIN_CLIENT };
    },
  };
});

vi.mock('../db', () => ({
  getPlatformDb: () => {
    getPlatformDb();
    return Promise.resolve({ db: PLATFORM_CLIENT });
  },
}));

vi.mock('@sovereignfs/mailer', () => ({ createMailer: () => ({ send: vi.fn() }) }));

let headerPluginId: string | null = null;
vi.mock('next/headers', () => ({
  headers: () =>
    Promise.resolve({
      get: (name: string) => (name === 'x-sovereign-plugin-id' ? headerPluginId : null),
    }),
}));

/**
 * Import sdk-host.ts exactly once, at module load — it registers the real
 * host via provideHost() as a side effect (same as
 * runtime/instrumentation.ts does in production). Deliberately NOT using
 * vi.resetModules() + a fresh dynamic import per test: that pattern relies
 * on Vitest's module graph being invalidated and rebuilt identically across
 * every pool/worker configuration, which proved flaky under CI's
 * Postgres-backed test run (passed consistently locally, failed
 * intermittently in CI) — a single, stable registration this file's own
 * mocks fully control is more robust than re-deriving "fresh" module state
 * per call. `sdk.db.getClient()` still reads `headerPluginId` fresh on every
 * call via the mocked `headers()` above, so each test's header value is
 * still exactly what that test sets.
 */
const sdkHostModule = await import('@sovereignfs/sdk');
await import('../sdk-host');

async function getClientAs(pluginId: string | null) {
  headerPluginId = pluginId;
  return sdkHostModule.sdk.db.getClient();
}

beforeEach(() => {
  vi.clearAllMocks();
  headerPluginId = null;
});

describe('sdk-host db.getClient — isolated-database plugin routing', () => {
  it('routes an isolated (sovereign-type) plugin to its own provisioned database', async () => {
    const client = await getClientAs('fs.sovereign.plainwrite');

    expect(provisionPluginDb).toHaveBeenCalledWith('fs.sovereign.plainwrite');
    expect(getPluginDb).toHaveBeenCalledWith('fs.sovereign.plainwrite');
    expect(client).toBe(PLUGIN_CLIENT);
    expect(getPlatformDb).not.toHaveBeenCalled();
  });

  it('routes a platform-type plugin (shared, never isolated) to the platform database', async () => {
    const client = await getClientAs('fs.sovereign.account');

    expect(client).toBe(PLATFORM_CLIENT);
    expect(provisionPluginDb).not.toHaveBeenCalled();
    expect(getPluginDb).not.toHaveBeenCalled();
  });
});

describe('sdk-host db.getClient — platform DB outside plugin route context', () => {
  it('returns the platform database when pluginId is null (no request context)', async () => {
    const client = await getClientAs(null);

    expect(client).toBe(PLATFORM_CLIENT);
    expect(provisionPluginDb).not.toHaveBeenCalled();
  });

  it('returns the platform database for an unknown plugin id (not in the registry)', async () => {
    const client = await getClientAs('not-a-real-plugin-id');

    expect(client).toBe(PLATFORM_CLIENT);
    expect(provisionPluginDb).not.toHaveBeenCalled();
  });
});

describe('sdk-host db.getClient — identity cannot be forged through SDK arguments', () => {
  it('sdk.db.getClient() takes no arguments — the plugin identity used for routing comes only from the injected request header, never from caller-supplied input', () => {
    // sdk.db.getClient() has an empty parameter list (packages/sdk/src/db.ts)
    // — there is no argument a plugin could pass to claim a different
    // identity. This asserts that structurally, not just behaviorally: a
    // plugin cannot even attempt to call getClient('some-other-plugin-id').
    expect(sdkHostModule.sdk.db.getClient.length).toBe(0);
  });

  it('always resolves the plugin identity from the request header, even when called from code that could otherwise pass anything', async () => {
    const client = await getClientAs('fs.sovereign.plainwrite');

    // Routed to the header-derived plugin's own database — never the
    // platform database and never a different plugin's database, regardless
    // of what a compromised caller might wish it could specify.
    expect(client).toBe(PLUGIN_CLIENT);
    expect(provisionPluginDb).toHaveBeenCalledWith('fs.sovereign.plainwrite');
    expect(provisionPluginDb).not.toHaveBeenCalledWith('fs.sovereign.account');
  });
});
