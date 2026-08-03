import { test, expect } from './fixtures';

test.describe('Account data portability — golden paths', () => {
  test('exporting then re-importing the same bundle round-trips cleanly', async ({
    userPage: page,
  }) => {
    await page.goto('/account/data');

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export as ZIP' }).click();
    const download = await downloadPromise;
    const zipPath = await download.path();
    expect(zipPath).toBeTruthy();

    await page.getByLabel('Upload ZIP file').setInputFiles(zipPath!);
    await page.getByRole('button', { name: 'Import' }).click();

    await expect(page.getByText('Import complete.')).toBeVisible();
  });
});
