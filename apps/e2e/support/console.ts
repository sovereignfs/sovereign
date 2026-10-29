import { expect, type Page } from '@playwright/test';

/** What an operator types and ticks to add an app, in the Console's words. */
export type NewApp = {
  name: string;
  launchUrl: string;
  redirectUri: string;
  kind: 'confidential' | 'public';
  /** Protocol scope names; the checkboxes are labelled with them. `openid` is always on. */
  scopes: string[];
  trusted?: boolean;
  postLogoutRedirectUri?: string;
  backchannelLogoutUri?: string;
};

const SCOPE_LABEL: Record<string, string> = {
  profile: 'Name and picture (profile)',
  email: 'Email address (email)',
  roles: 'Their role here (roles)',
  directory: 'Look people up (directory)',
  offline_access: 'Stay signed in (offline_access)',
};

/** Adds an app in the Console and returns what it gave: the app's ID, and the secret (shown once) when it keeps one. */
export async function registerApp(
  page: Page,
  app: NewApp,
): Promise<{ id: string; secret: string | undefined }> {
  await page.goto('/console/apps/new');
  await page.locator('input[name="name"]').fill(app.name);
  await page.getByLabel('Launch address').fill(app.launchUrl);
  await page.getByLabel('Sign-in addresses').fill(app.redirectUri);
  await page.getByLabel('Kind of app').selectOption(app.kind);
  await page.getByText('Technical settings, for the people who build the app').click();
  if (app.postLogoutRedirectUri) {
    await page.getByLabel('Addresses after sign-out').fill(app.postLogoutRedirectUri);
  }
  if (app.backchannelLogoutUri) {
    await page.getByLabel('Back-channel logout address').fill(app.backchannelLogoutUri);
  }
  // Trust first: the role scope is not offered to an app that is not trusted.
  if (app.trusted) await page.getByLabel('Trust this app').check();
  for (const scope of app.scopes) {
    const label = SCOPE_LABEL[scope];
    if (!label) throw new Error(`No checkbox is known for the scope ${scope}.`);
    await page.getByLabel(label).check();
  }
  await page.getByRole('button', { name: 'Add the app' }).click();

  await expect(page.getByText(/The app’s ID is/)).toBeVisible();
  const id = await page.locator('p', { hasText: 'The app’s ID is' }).locator('code').innerText();
  const secret =
    app.kind === 'confidential' ? await page.locator('code').first().innerText() : undefined;
  expect(id).not.toBe('');
  return { id, secret };
}
