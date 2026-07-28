import { test, expect } from './fixtures';

test.describe('Account plugin — golden paths', () => {
  test('direct navigation to /account/profile renders the profile page', async ({
    adminPage: page,
  }) => {
    await page.goto('/account/profile');
    // Full-page fallback (not overlay interception) renders when navigating directly.
    await expect(page.locator('label[for="name"]')).toBeVisible();
    await expect(page.locator('#name')).toBeVisible();
  });

  test('display name can be updated and persists', async ({ adminPage: page }) => {
    await page.goto('/account/profile');
    const input = page.locator('#name');
    const original = await input.inputValue();
    const updated = `Test Name ${Date.now()}`;
    const saveButton = page.locator('button[type="submit"]');

    // `waitForLoadState('networkidle')` never resolves here — the shell's
    // NotificationBell keeps an SSE connection open for the whole session, so
    // the network is never idle. `useActionState`'s pending flag (DisplayNameForm)
    // gives a direct, deterministic completion signal via the button's own label.
    await input.fill(updated);
    await saveButton.click();
    await expect(saveButton).toHaveText('Saving…');
    await expect(saveButton).toHaveText('Save name', { timeout: 15_000 });
    await expect(input).toHaveValue(updated);

    // Restore original name so subsequent runs start from a clean state.
    await input.fill(original);
    await saveButton.click();
    await expect(saveButton).toHaveText('Saving…');
    await expect(saveButton).toHaveText('Save name', { timeout: 15_000 });
  });

  test('theme can be toggled to Dark and applies to the document', async ({ adminPage: page }) => {
    await page.goto('/account/preferences');
    // SegmentedControl renders role="radiogroup" with role="radio" children.
    const group = page.locator('div[role="radiogroup"][aria-label="Appearance"]');
    await expect(group).toBeVisible();

    const originalTheme = await page.evaluate(
      () => (document.documentElement as HTMLElement).dataset.theme ?? 'system',
    );

    await group.getByRole('radio', { name: 'Dark' }).click();
    // ThemeControl applies the attribute immediately before the server action round-trip.
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    // Restore to the original theme.
    const restoreLabel = originalTheme === 'light' ? 'Light' : 'System';
    await group.getByRole('radio', { name: restoreLabel }).click();
  });
});
