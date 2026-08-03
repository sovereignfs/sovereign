import { test, expect } from './fixtures';

test.describe('Console — auditor golden paths', () => {
  test('auditor can view the activity log', async ({ auditorPage: page }) => {
    await page.goto('/console/activity');
    await expect(page.locator('h1')).toHaveText('Console');
    // Either the events table or the empty-state message renders — both
    // confirm the page loaded data rather than being blocked.
    await expect(
      page
        .getByRole('columnheader', { name: 'Event' })
        .or(page.getByText('No activity recorded yet.')),
    ).toBeVisible();
  });

  test('auditor can view system health', async ({ auditorPage: page }) => {
    await page.goto('/console/health');
    await expect(page.getByRole('heading', { name: 'System health' })).toBeVisible();
  });

  test('auditor sees the user list but no invite action', async ({ auditorPage: page }) => {
    await page.goto('/console/users');
    await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();
    await expect(page.getByRole('button', { name: '+ Invite' })).toHaveCount(0);
  });
});
