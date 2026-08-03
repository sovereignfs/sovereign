import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test as base, type Page } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_DIR = path.resolve(__dirname, '../../.auth');

type AuthFixtures = {
  ownerPage: Page;
  adminPage: Page;
  auditorPage: Page;
  userPage: Page;
};

/**
 * Extended test fixtures providing pre-authenticated page objects.
 * Each fixture creates an isolated browser context with saved storage state so
 * tests don't re-login on every run — auth state is captured once in global-setup.
 *
 * Tests that need an unauthenticated browser should import { test } from
 * '@playwright/test' directly.
 */
export const test = base.extend<AuthFixtures>({
  ownerPage: async ({ browser }, use) => {
    const ctx = await browser.newContext({
      storageState: path.join(AUTH_DIR, 'owner.json'),
    });
    const page = await ctx.newPage();
    await use(page);
    await ctx.close();
  },

  adminPage: async ({ browser }, use) => {
    const ctx = await browser.newContext({
      storageState: path.join(AUTH_DIR, 'admin.json'),
    });
    const page = await ctx.newPage();
    await use(page);
    await ctx.close();
  },

  auditorPage: async ({ browser }, use) => {
    const ctx = await browser.newContext({
      storageState: path.join(AUTH_DIR, 'auditor.json'),
    });
    const page = await ctx.newPage();
    await use(page);
    await ctx.close();
  },

  userPage: async ({ browser }, use) => {
    const ctx = await browser.newContext({
      storageState: path.join(AUTH_DIR, 'user.json'),
    });
    const page = await ctx.newPage();
    await use(page);
    await ctx.close();
  },
});

export { expect } from '@playwright/test';
