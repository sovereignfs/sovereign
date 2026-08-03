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

    const clientCard = page.locator('div', { has: page.getByText(clientName) }).last();
    await clientCard.getByRole('button', { name: 'Revoke' }).click();

    await expect(page.getByText(clientName)).not.toBeVisible();
  });
});
