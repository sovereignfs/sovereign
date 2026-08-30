import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runWithBackgroundPlugin } from '../background-plugin-context';

const markPluginConnectionUsed = vi.fn();
const getPluginSecret = vi.fn();
const recordActivity = vi.fn();
const getPlatformDb = vi.fn();

const PLATFORM_CLIENT = 'platform-db-marker';

vi.mock('@sovereignfs/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sovereignfs/db')>();
  return {
    ...actual,
    markPluginConnectionUsed: (...args: unknown[]) => {
      markPluginConnectionUsed(...args);
      return Promise.resolve();
    },
    getPluginSecret: (...args: unknown[]) => {
      getPluginSecret(...args);
      return Promise.resolve(undefined);
    },
    recordActivity: (...args: unknown[]) => {
      recordActivity(...args);
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
      get: (name: string) => (name === 'x-sovereign-plugin-id' ? headerPluginId : null),
    }),
}));

/**
 * Regression coverage for a codebase-audit finding: this repo's history
 * shows the "headers() throws outside a real request" bug independently
 * rediscovered and fixed one sdk.* surface at a time (db.getClient, storage,
 * env, crypto). This proactively swept the remaining surfaces a job/schedule
 * handler could plausibly call (connections.markUsed, secrets.get,
 * activity.log — explicitly named in the audit as realistic sync-job needs)
 * rather than waiting for each to be independently hit in production. Covers
 * a representative sample; connections/secrets/handoffs/tools all share the
 * identical resolve*Context() fallback shape in sdk-host.ts.
 */
const sdkHostModule = await import('@sovereignfs/sdk');
await import('../sdk-host');

beforeEach(() => {
  vi.clearAllMocks();
  headerPluginId = null;
});

describe('sdk.connections.markUsed — background-invocation plugin id routing', () => {
  it('resolves the plugin id from the background context when there is no request header', async () => {
    await runWithBackgroundPlugin('fs.example.sync', () => {
      headerPluginId = null;
      return sdkHostModule.sdk.connections.markUsed('conn-1');
    });
    expect(markPluginConnectionUsed).toHaveBeenCalledWith(
      { db: PLATFORM_CLIENT },
      'conn-1',
      expect.objectContaining({ pluginId: 'fs.example.sync' }),
    );
  });

  it('throws when no request header and no background context are present', async () => {
    headerPluginId = null;
    await expect(sdkHostModule.sdk.connections.markUsed('conn-1')).rejects.toThrow(
      /plugin route context/,
    );
    expect(markPluginConnectionUsed).not.toHaveBeenCalled();
  });
});

describe('sdk.secrets.get — background-invocation plugin id routing', () => {
  it('resolves the plugin id from the background context when there is no request header', async () => {
    await runWithBackgroundPlugin('fs.example.sync', () => {
      headerPluginId = null;
      return sdkHostModule.sdk.secrets.get('secret-1');
    });
    expect(getPluginSecret).toHaveBeenCalledWith(
      { db: PLATFORM_CLIENT },
      'secret-1',
      expect.objectContaining({ pluginId: 'fs.example.sync' }),
    );
  });

  it('throws when no request header and no background context are present', async () => {
    headerPluginId = null;
    await expect(sdkHostModule.sdk.secrets.get('secret-1')).rejects.toThrow(/plugin route context/);
    expect(getPluginSecret).not.toHaveBeenCalled();
  });
});

describe('sdk.activity.log — background-invocation plugin id routing', () => {
  it('attributes the log entry to the background plugin context when there is no request header', async () => {
    await runWithBackgroundPlugin('fs.example.sync', () => {
      headerPluginId = null;
      return sdkHostModule.sdk.activity.log({ action: 'sync.completed' });
    });
    expect(recordActivity).toHaveBeenCalledWith(
      { db: PLATFORM_CLIENT },
      expect.objectContaining({ pluginId: 'fs.example.sync', actorType: 'plugin' }),
    );
  });

  it('does not throw with no request header and no background context — records an unattributed entry', async () => {
    headerPluginId = null;
    await expect(
      sdkHostModule.sdk.activity.log({ action: 'sync.completed' }),
    ).resolves.toBeUndefined();
    expect(recordActivity).toHaveBeenCalledWith(
      { db: PLATFORM_CLIENT },
      expect.objectContaining({ pluginId: null, actorType: 'user' }),
    );
  });
});
