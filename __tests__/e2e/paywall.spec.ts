import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ID = 'fs.sovereign.example-monetized';
const PLUGIN_ROUTE = '/example-monetized';
const TOKEN_FILE = path.join(__dirname, '../../.auth/test-token.txt');

function readTestToken(): string | null {
  if (!existsSync(TOKEN_FILE)) return null;
  return readFileSync(TOKEN_FILE, 'utf8').trim();
}

async function revokeTestEntitlement(page: Page): Promise<void> {
  const entitlementRes = await page.request.get('/api/account/entitlements');
  if (!entitlementRes.ok()) return;

  const data = (await entitlementRes.json()) as {
    entitlements?: Array<{ id: string; pluginId: string }>;
  };
  const entry = data.entitlements?.find((e) => e.pluginId === PLUGIN_ID);
  if (entry) {
    await page.request.delete(`/api/account/entitlements?id=${encodeURIComponent(entry.id)}`);
  }
}

test.describe('Paywall — golden paths', () => {
  test('navigating to a paywalled plugin redirects to the paywall page', async ({
    userPage: page,
  }) => {
    await revokeTestEntitlement(page);
    await page.goto(PLUGIN_ROUTE);
    // Middleware 303-redirects to /paywall/<pluginId> for page routes.
    await expect(page).toHaveURL(
      new RegExp(`/paywall/${encodeURIComponent(PLUGIN_ID)}|/paywall/${PLUGIN_ID}`),
    );
  });

  test('paywall page shows plugin tier information', async ({ userPage: page }) => {
    await page.goto(`/paywall/${PLUGIN_ID}`);
    // Tiers list must be present with the tiers declared in the manifest.
    const tiers = page.locator('ul[aria-label="Available tiers"]');
    await expect(tiers).toBeVisible();
    await expect(tiers.getByText('Basic')).toBeVisible();
    await expect(tiers.getByText('Pro')).toBeVisible();
  });

  test('importing a valid license token grants access to the plugin', async ({
    userPage: page,
  }) => {
    const token = readTestToken();
    if (!token) {
      test.skip(true, 'No test token available — global-setup paywall step may have failed.');
      return;
    }

    await page.goto(`/paywall/${PLUGIN_ID}`);
    // Fill the license import form.
    await page.getByLabel('License token').fill(token);
    await page.getByRole('button', { name: /activate|import/i }).click();

    // Successful import redirects to the plugin route.
    await page.waitForURL(`**${PLUGIN_ROUTE}**`, { timeout: 10_000 });
    expect(page.url()).toContain(PLUGIN_ROUTE);

    // Cleanup: revoke the entitlement so subsequent runs can re-import.
    await revokeTestEntitlement(page);
  });
});
