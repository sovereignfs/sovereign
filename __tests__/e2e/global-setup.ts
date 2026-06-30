import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type FullConfig } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const AUTH_DIR = path.join(ROOT, '.auth');
const RUNTIME = 'http://localhost:3000';

async function loginAndSave(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  email: string,
  password: string,
  outPath: string,
): Promise<void> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  // Unauthenticated visits redirect to the runtime's same-origin login page.
  await page.goto(`${RUNTIME}/`);
  await page.waitForURL(`${RUNTIME}/login**`);
  await page.fill('#login-email', email);
  await page.fill('#login-password', password);
  await page.click('button[type="submit"]');
  // On success the runtime login flow returns to the authenticated runtime.
  await page.waitForURL(`${RUNTIME}/`, { timeout: 15_000 });
  // storageState captures runtime cookies after the proxied login flow. Tests
  // pre-injecting this state are fully authenticated.
  await ctx.storageState({ path: outPath });
  await ctx.close();
}

export default async function globalSetup(_config: FullConfig): Promise<void> {
  mkdirSync(AUTH_DIR, { recursive: true });

  // Seed test users (idempotent — safe to run on a populated DB).
  execSync('pnpm sv seed', { cwd: ROOT, stdio: 'inherit' });

  const browser = await chromium.launch();
  try {
    await loginAndSave(
      browser,
      'admin@sovereign.local',
      'admin-dev-password',
      path.join(AUTH_DIR, 'admin.json'),
    );
    await loginAndSave(
      browser,
      'user@sovereign.local',
      'user-dev-password',
      path.join(AUTH_DIR, 'user.json'),
    );

    await setupPaywallToken(browser);
  } finally {
    await browser.close();
  }
}

/**
 * Generate an Ed25519 keypair, store the public key for the example-monetized plugin
 * via the admin API (DB-first key resolution path), sign a test license token, and
 * write it to .auth/test-token.txt for the paywall spec to read.
 */
async function setupPaywallToken(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
): Promise<void> {
  const adminKey =
    process.env.E2E_ADMIN_KEY ?? process.env.SOVEREIGN_ADMIN_KEY ?? 'sovereign-e2e-admin-key';
  const pluginId = 'fs.sovereign.example-monetized';

  // Generate keypair via Web Crypto (available in Node 19+; CI uses Node 20+).
  const { privateKey, publicKey } = await crypto.subtle.generateKey(
    { name: 'Ed25519' } as EcKeyGenParams,
    true,
    ['sign', 'verify'],
  );
  const pubJwk = await crypto.subtle.exportKey('jwk', publicKey);
  const privJwk = await crypto.subtle.exportKey('jwk', privateKey);

  // Store the public key in platform_settings so the verify route uses it instead of
  // the manifest's static key (DB-first resolution).
  const res = await fetch(`${RUNTIME}/api/admin/license-keys`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminKey}`,
    },
    body: JSON.stringify({
      pluginId,
      publicKey: pubJwk.x,
      privateKey: privJwk.d,
    }),
  });
  if (!res.ok) {
    console.warn(
      `[global-setup] Failed to store license key: ${res.status}. Paywall test may skip.`,
    );
    return;
  }

  // Build and sign a test token in the platform's format: base64url(payload).base64url(sig).
  const payload = JSON.stringify({
    pluginId,
    sub: 'test-user',
    issuedAt: Math.floor(Date.now() / 1000),
    tier: 'pro',
  });
  const payloadB64 = Buffer.from(payload).toString('base64url');
  const sigBytes = await crypto.subtle.sign(
    { name: 'Ed25519' } as EcdsaParams,
    privateKey,
    Buffer.from(payloadB64),
  );
  const sigB64 = Buffer.from(sigBytes).toString('base64url');
  const token = `${payloadB64}.${sigB64}`;

  writeFileSync(path.join(AUTH_DIR, 'test-token.txt'), token, 'utf8');
}
