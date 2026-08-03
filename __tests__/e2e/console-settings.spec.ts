import { test, expect } from './fixtures';

test.describe('Console settings — golden paths', () => {
  test('admin sees SMTP settings as read-only', async ({ adminPage: page }) => {
    await page.goto('/console/settings');
    await expect(
      page.getByText('Only the instance owner can view or change these values.'),
    ).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Host' })).not.toBeVisible();
  });

  test('owner sees an editable SMTP settings form', async ({ ownerPage: page }) => {
    await page.goto('/console/settings');
    const hostField = page.getByRole('textbox', { name: 'Host' });
    await expect(hostField).toBeVisible();
    const smtpForm = hostField.locator('xpath=ancestor::form');
    await expect(smtpForm.getByRole('button', { name: 'Save' })).toBeVisible();
  });
});
