import { test, expect } from './fixtures';

test.describe('Console external OAuth clients — golden paths', () => {
  test('admin can register, see the one-time secret, then revoke a client', async ({
    adminPage: page,
  }) => {
    await page.goto('/console/oauth-clients');

    const clientName = `e2e-test-client-${Date.now()}`;
    await page.getByLabel('Display name').fill(clientName);
    await page.getByLabel('Redirect URIs').fill('https://example.test/callback');
    await page.getByLabel('Redirect URIs').press('Enter');
    await page.getByRole('button', { name: 'Register client' }).click();

    // Secret is shown exactly once, immediately after creation. Next.js's own
    // route announcer also has role="alert" (empty), so scope past it.
    const revealedSecret = page.getByRole('alert').filter({ hasText: 'Client secret for' });
    await expect(revealedSecret).toContainText('shown once, copy it now');
    // Curly apostrophe (U+2019, &rsquo; in the source) — not a straight one —
    // Playwright's accessible-name match is exact, so a straight "'" here
    // never resolves and hangs until the test times out.
    await page.getByRole('button', { name: 'Done, I’ve copied it' }).click();

    await expect(page.getByText(clientName)).toBeVisible();

    // Rotate/Revoke live in the selection-driven desktop detail pane
    // (workstream 0022 leg 5), not inline on the card anymore — the card's
    // own copy of these actions is `.cardManageMobile`, `display: none` at
    // this viewport width.
    await page.getByRole('link', { name: new RegExp(clientName) }).click();
    await page.getByRole('button', { name: 'Revoke' }).click();

    // Revoking is a real DELETE against the auth server, then a refetch of
    // the client list — give it a moment before asserting. Confirmed via a
    // captured trace this is not app-level flakiness (the same click
    // sequence at human speed always revokes cleanly, and a captured delete
    // request did complete with a real 200): the dev webServer's own
    // long-lived connections (notifications SSE, webpack-hmr) can delay an
    // unrelated in-flight request under Playwright's much-faster-than-human
    // click cadence. Re-assert after a fresh load if the first check is slow
    // to catch up, rather than trusting only whatever React state the click
    // happened to land on.
    try {
      await expect(page.getByText(clientName)).not.toBeVisible({ timeout: 5_000 });
    } catch {
      await page.reload();
      await expect(page.getByText(clientName)).not.toBeVisible();
    }
  });
});
