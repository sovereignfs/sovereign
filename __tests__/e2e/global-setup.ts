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
  // Unauthenticated GET / is rewritten (not redirected) to the login document
  // so the URL stays "/" — see runtime/middleware.ts's iOS PWA splash rewrite.
  await page.goto(`${RUNTIME}/`);
  await page.waitForSelector('#login-email');
  await page.fill('#login-email', email);
  await page.fill('#login-password', password);
  await page.click('button[type="submit"]');
  // Can't wait for a URL change on success either: unauthenticated GET / is
  // rewritten (not redirected) to the login document, so the browser is
  // already sitting on RUNTIME/ before submitting — waitForURL(RUNTIME/) would
  // resolve instantly against the page we started on, racing ahead of the
  // sign-in request and its Set-Cookie, and storageState below would capture
  // an unauthenticated (cookie-less) context. Wait for the authenticated
  // shell to actually render instead.
  await page.getByRole('button', { name: 'Account' }).first().waitFor({ timeout: 15_000 });
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
    // better-auth rate-limits /sign-in/* (and /sign-up/*, /change-password,
    // /change-email) to max 3 requests per 10s per IP — see
    // apps/auth/src/auth.ts's rateLimit config and better-auth's
    // getDefaultSpecialRules(). In dev every browser request resolves to the
    // same LOCALHOST_IP bucket, so logging in all four seeded roles
    // back-to-back always trips this on the 4th request.
    //
    // Critically, the counter does NOT reset on a fixed 10s calendar window —
    // better-auth's decideConsume() only resets `count` when the gap since
    // the *previous* request exceeds the window (see
    // node_modules/better-auth/dist/api/rate-limiter/index.mjs). A short
    // inter-request delay (e.g. 4s) still keeps every request inside the
    // previous one's window, so count climbs 1 → 2 → 3 → 4 and the 4th is
    // rejected — surfaced by the login form as a generic "incorrect email or
    // password" (it maps any non-EMAIL_NOT_VERIFIED error to that message,
    // deliberately not distinguishing rate-limit from bad credentials). The
    // delay must exceed the 10s window on every single hop, not just in
    // aggregate, to force a reset before each subsequent sign-in.
    const accounts: Array<[string, string]> = [
      ['owner@sovereign.local', 'owner.json'],
      ['admin@sovereign.local', 'admin.json'],
      ['auditor@sovereign.local', 'auditor.json'],
      ['user@sovereign.local', 'user.json'],
    ];
    for (let i = 0; i < accounts.length; i++) {
      const [email, file] = accounts[i];
      await loginAndSave(browser, email, 'sovereign', path.join(AUTH_DIR, file));
      if (i < accounts.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 11_000));
      }
    }

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
