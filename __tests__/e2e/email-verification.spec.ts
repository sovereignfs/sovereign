import { test, expect } from '@playwright/test';

// The auth server owns the better-auth API (`/api/auth/*`) plus the `/login`,
// `/login/2fa` and `/verify-email` pages. Every other auth *page* —
// `/register`, `/forgot-password`, `/reset-password` — is served only by the
// runtime; the auth server's duplicates were removed when the two were
// deduplicated. Navigating to one of those on AUTH_SERVER renders the auth
// app's not-found page, so always reach them via RUNTIME.
const AUTH_SERVER = 'http://localhost:3001';
const RUNTIME = 'http://localhost:3000';

/**
 * The e2e webServer runs with AUTH_REQUIRE_EMAIL_VERIFICATION=false (see
 * playwright.config.ts — config is resolved once at server boot, so it can't
 * be toggled per-spec within this shared server process). This spec covers
 * the opt-out path itself: registering still works exactly as before and
 * grants an immediate session, with no email step. The default-on (required)
 * path — send email, block sign-in until verified, click link to gain access
 * — is covered by apps/auth/src/__tests__/auth.test.ts's config assertions
 * and the manual Mailpit-based verification checklist, not here.
 */
test.describe('Email verification — disabled (AUTH_REQUIRE_EMAIL_VERIFICATION=false)', () => {
  test('registration grants an immediate session with no verification step', async ({ page }) => {
    const email = `verify-off-${Date.now()}@test.local`;

    await page.goto(`${RUNTIME}/register`);
    await page.fill('#register-name', 'No Verification Tester');
    await page.fill('#register-email', email);
    await page.fill('#register-password', 'initial-password-123');
    await page.fill('#register-confirm-password', 'initial-password-123');
    // Required since registration now records explicit ToS/privacy acceptance
    // (GDPR-8) — the browser's own `required` validation blocks submission
    // without it, leaving the page on /register with no server round trip.
    await page.getByRole('checkbox').check();
    await page.click('button[type="submit"]');

    // Signed in immediately — no "check your email" interstitial. Can't assert
    // this with waitForURL: registration completes on the runtime and navigates
    // to `/` there, so `${RUNTIME}/**` already matches before submitting and
    // would resolve instantly without proving anything (same hazard auth.spec.ts
    // documents for login). Wait for the authenticated shell to render instead.
    await page.getByRole('button', { name: 'Account' }).first().waitFor({ timeout: 15_000 });
    await expect(page).toHaveURL(`${RUNTIME}/`);
  });

  test('a freshly registered account can sign in immediately (no EMAIL_NOT_VERIFIED block)', async ({
    page,
  }) => {
    const email = `verify-off-signin-${Date.now()}@test.local`;
    const password = 'initial-password-123';

    const signUpRes = await fetch(`${AUTH_SERVER}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: AUTH_SERVER },
      // agreedToTerms is required — registration now records explicit
      // ToS/privacy acceptance (GDPR-8) and rejects sign-up outright
      // without it.
      body: JSON.stringify({ email, password, name: 'Sign In Tester', agreedToTerms: true }),
    });
    expect(signUpRes.status === 200 || signUpRes.status === 201).toBe(true);

    await page.goto(`${AUTH_SERVER}/login`);
    await page.fill('#login-email', email);
    await page.fill('#login-password', password);
    await page.click('button[type="submit"]');

    await page.waitForURL(`${RUNTIME}/**`, { timeout: 15_000 });
    expect(page.url().startsWith(RUNTIME)).toBe(true);
  });
});
