import { test, expect } from '@playwright/test';

const AUTH_SERVER = 'http://localhost:3001';
const RUNTIME = 'http://localhost:3000';
const MAILPIT_API = 'http://localhost:8025/api/v1';

// ---------------------------------------------------------------------------
// Mailpit helpers
// ---------------------------------------------------------------------------

async function isMailpitAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${MAILPIT_API}/info`, { signal: AbortSignal.timeout(2_000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function clearMailpitInbox(): Promise<void> {
  await fetch(`${MAILPIT_API}/messages`, { method: 'DELETE' });
}

interface MailpitMessage {
  ID: string;
  To: Array<{ Address: string }>;
}

/**
 * Poll Mailpit until an email addressed to `address` arrives, then return its
 * HTML body. Returns null if nothing arrives within `timeoutMs`.
 */
async function waitForEmailTo(address: string, timeoutMs = 10_000): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${MAILPIT_API}/messages`);
      if (res.ok) {
        const data = (await res.json()) as { messages?: MailpitMessage[] };
        const msg = data.messages?.find((m) => m.To.some((t) => t.Address === address));
        if (msg) {
          const detail = await fetch(`${MAILPIT_API}/message/${msg.ID}`);
          const body = (await detail.json()) as { HTML?: string; Text?: string };
          return body.HTML ?? body.Text ?? null;
        }
      }
    } catch {
      // Mailpit not yet ready — keep polling
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}

/** Extract the reset URL from the email HTML (or plain-text fallback). */
function extractResetUrl(body: string): string | null {
  // HTML: href="...reset-password?token=..."
  const htmlMatch = body.match(/href="([^"]*\/reset-password\?token=[^"]+)"/);
  if (htmlMatch) return htmlMatch[1];
  // Plain text: bare URL
  const textMatch = body.match(/(https?:\/\/[^\s]*\/reset-password\?token=[^\s]+)/);
  return textMatch ? textMatch[1] : null;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Password reset — page rendering', () => {
  test('forgot-password page renders the email form', async ({ page }) => {
    await page.goto(`${AUTH_SERVER}/forgot-password`);
    await expect(page.locator('h1')).toContainText('Reset password');
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toContainText('Send reset link');
    await expect(page.locator(`a[href="/login"]`)).toContainText('Back to sign in');
  });

  test('submitting an unknown email shows the same confirmation — no user enumeration', async ({
    page,
  }) => {
    await page.goto(`${AUTH_SERVER}/forgot-password`);
    await page.fill('input[type="email"]', 'nobody-registered@example.com');
    await page.click('button[type="submit"]');
    await expect(page.locator('h1')).toContainText('Check your email');
    await expect(page.locator('[role="status"]')).toContainText(
      'If that email address is registered',
    );
  });

  test('reset-password page without a token shows the invalid-link state', async ({ page }) => {
    await page.goto(`${AUTH_SERVER}/reset-password`);
    await expect(page.locator('h1')).toContainText('Invalid link');
    await expect(page.locator(`a[href="/forgot-password"]`)).toBeVisible();
  });

  test('reset-password with a bogus token shows an error after submit', async ({ page }) => {
    await page.goto(`${AUTH_SERVER}/reset-password?token=this-is-not-a-real-token`);
    await expect(page.locator('h1')).toContainText('Choose a new password');
    await page.fill('#reset-password', 'newpassword123');
    await page.fill('#reset-confirm', 'newpassword123');
    await page.click('button[type="submit"]');
    // better-auth returns INVALID_TOKEN; the form surfaces it as human-readable text.
    await expect(page.locator('form p')).toContainText(/invalid|expired/i);
  });

  test('mismatched passwords show a client-side error without hitting the server', async ({
    page,
  }) => {
    await page.goto(`${AUTH_SERVER}/reset-password?token=any-token`);
    await page.fill('#reset-password', 'password-one');
    await page.fill('#reset-confirm', 'password-two');
    await page.click('button[type="submit"]');
    // Client-side guard fires before any network request.
    await expect(page.locator('form p')).toContainText('do not match');
    // We should still be on the reset page, not a success screen.
    await expect(page.locator('h1')).toContainText('Choose a new password');
  });
});

test.describe('Password reset — full flow (requires Mailpit on localhost:8025)', () => {
  let testEmail = '';
  let mailpitUp = false;
  let userCreated = false;

  test.beforeAll(async () => {
    mailpitUp = await isMailpitAvailable();

    // Register a fresh one-off user dedicated to this describe block so the
    // flow doesn't affect the seeded admin/user accounts used by other specs.
    testEmail = `reset-flow-${Date.now()}@test.local`;
    const res = await fetch(`${AUTH_SERVER}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: AUTH_SERVER },
      body: JSON.stringify({
        email: testEmail,
        password: 'initial-password-123',
        name: 'Reset Flow Tester',
      }),
    });
    // 200 = created; 422 could mean invite-only is on or the user exists from a
    // previous run. Either way mark as not created so the tests skip cleanly.
    userCreated = res.status === 200 || res.status === 201;
  });

  test('request reset email → click link → set new password → sign in succeeds', async ({
    page,
  }) => {
    test.skip(!mailpitUp, 'Mailpit is not running on localhost:8025');
    test.skip(!userCreated, 'Test user could not be created (invite-only mode?)');

    await clearMailpitInbox();

    // 1. Submit the forgot-password form
    await page.goto(`${AUTH_SERVER}/forgot-password`);
    await page.fill('input[type="email"]', testEmail);
    await page.click('button[type="submit"]');
    await expect(page.locator('h1')).toContainText('Check your email');

    // 2. Wait for the reset email to arrive in Mailpit
    const body = await waitForEmailTo(testEmail);
    expect(body, 'Reset email was not received in Mailpit within 10 s').not.toBeNull();

    // 3. Parse the reset URL from the email body
    const resetUrl = extractResetUrl(body!);
    expect(resetUrl, 'Reset link not found in email body').not.toBeNull();

    // 4. Navigate to the reset page via the link from the email
    await page.goto(resetUrl!);
    await expect(page.locator('h1')).toContainText('Choose a new password');

    // 5. Submit a new password
    const newPassword = 'after-reset-456!';
    await page.fill('#reset-password', newPassword);
    await page.fill('#reset-confirm', newPassword);
    await page.click('button[type="submit"]');
    await expect(page.locator('h1')).toContainText('Password reset');
    await expect(page.locator('[role="status"]')).toContainText('updated');

    // 6. Sign in with the new password and verify we land on the runtime
    await page.click(`a[href="/login"]`);
    await page.fill('#login-email', testEmail);
    await page.fill('#login-password', newPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL(`${RUNTIME}/**`, { timeout: 15_000 });
    expect(page.url()).toContain(RUNTIME);
  });

  test('a reset token is single-use — reusing it shows an error', async ({ page }) => {
    test.skip(!mailpitUp, 'Mailpit is not running on localhost:8025');
    test.skip(!userCreated, 'Test user could not be created (invite-only mode?)');

    await clearMailpitInbox();

    // Request a fresh reset token via the API directly (avoids touching the UI again).
    await fetch(`${AUTH_SERVER}/api/auth/request-password-reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: AUTH_SERVER },
      body: JSON.stringify({ email: testEmail, redirectTo: '/reset-password' }),
    });

    const body = await waitForEmailTo(testEmail);
    expect(body, 'Reset email was not received').not.toBeNull();
    const resetUrl = extractResetUrl(body!);
    expect(resetUrl, 'Reset link not found in email').not.toBeNull();

    // First use — succeeds
    await page.goto(resetUrl!);
    await page.fill('#reset-password', 'single-use-pass-1');
    await page.fill('#reset-confirm', 'single-use-pass-1');
    await page.click('button[type="submit"]');
    await expect(page.locator('h1')).toContainText('Password reset');

    // Second use with the same token — must fail
    await page.goto(resetUrl!);
    await page.fill('#reset-password', 'single-use-pass-2');
    await page.fill('#reset-confirm', 'single-use-pass-2');
    await page.click('button[type="submit"]');
    await expect(page.locator('form p')).toContainText(/invalid|expired/i);
  });
});
