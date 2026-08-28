import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runWithBackgroundPlugin } from '../background-plugin-context';

let headerPluginId: string | null = null;
vi.mock('next/headers', () => ({
  headers: () =>
    Promise.resolve({
      get: (name: string) => (name === 'x-sovereign-plugin-id' ? headerPluginId : null),
    }),
}));

/**
 * Regression coverage for the `sdk.env` background-invocation gap found
 * implementing `sovereign-plugin-travellog`'s T.20 (a schedule handler
 * wanting to read a manifest-declared `REMINDER_LEAD_MINUTES` env var): `env.get()`
 * (`packages/sdk/src/env.ts`) called `next/headers()` with no try/catch, so
 * any `sdk.env.get()` call from an `sdk.jobs`/`sdk.schedules` handler (no
 * real Next.js request) threw outright — the identical gap the `sdk.storage`
 * fix closed, just never generalized to `env` (`sdk-host-storage-routing.test.ts`
 * is this file's direct sibling — mirrors its mocking approach). Unlike
 * storage, `env.get()`'s documented contract is to return `null` (not throw)
 * when no plugin id is resolvable at all, so the "nothing resolves" case
 * below asserts `null`, not a rejection.
 */
const sdkHostModule = await import('@sovereignfs/sdk');
await import('../sdk-host');

const PLUGIN_A = 'fs.example.widget';
const PLUGIN_REQUEST = 'fs.example.request';
const PLUGIN_BACKGROUND = 'fs.example.background';

async function getAs(pluginId: string | null, key: string) {
  headerPluginId = pluginId;
  return sdkHostModule.sdk.env.get(key);
}

beforeEach(() => {
  headerPluginId = null;
  vi.unstubAllEnvs();
});

describe('sdk-host env.get — plugin id routing', () => {
  it('resolves the plugin id from the request header inside a real request', async () => {
    vi.stubEnv('SV_PLUGIN_FS_EXAMPLE_WIDGET_API_KEY', 'secret-value');
    await expect(getAs(PLUGIN_A, 'API_KEY')).resolves.toBe('secret-value');
  });

  it('returns null when no request header and no background context are present', async () => {
    vi.stubEnv('SV_PLUGIN_FS_EXAMPLE_WIDGET_API_KEY', 'secret-value');
    await expect(getAs(null, 'API_KEY')).resolves.toBeNull();
  });

  it('returns null when the plugin id resolves but the declared variable is unset', async () => {
    await expect(getAs(PLUGIN_A, 'MISSING_KEY')).resolves.toBeNull();
  });

  it('falls back to the background-invocation plugin context when running inside a job/schedule handler (no request header)', async () => {
    vi.stubEnv('SV_PLUGIN_FS_EXAMPLE_WIDGET_API_KEY', 'secret-value');
    await expect(runWithBackgroundPlugin(PLUGIN_A, () => getAs(null, 'API_KEY'))).resolves.toBe(
      'secret-value',
    );
  });

  it('prefers the request header over the background context when both are present', async () => {
    vi.stubEnv('SV_PLUGIN_FS_EXAMPLE_REQUEST_API_KEY', 'header-value');
    vi.stubEnv('SV_PLUGIN_FS_EXAMPLE_BACKGROUND_API_KEY', 'background-value');
    await expect(
      runWithBackgroundPlugin(PLUGIN_BACKGROUND, () => getAs(PLUGIN_REQUEST, 'API_KEY')),
    ).resolves.toBe('header-value');
  });
});
