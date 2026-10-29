import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { CORE_URL, freshAddress, PASSWORD } from './env';

export type Who = { name: string; email: string; password: string };

/** A browser of its own: its own cookies, its own session and its own address, as another person's would be. */
export async function newPerson(
  browser: Browser,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    baseURL: CORE_URL,
    extraHTTPHeaders: { 'x-forwarded-for': freshAddress() },
  });
  return { context, page: await context.newPage() };
}

export async function signUp(page: Page, who: Who, path = '/sign-up'): Promise<void> {
  await page.goto(path);
  await page.getByLabel('Name', { exact: false }).first().fill(who.name);
  const email = page.getByLabel('Email');
  // An invitation fills the address in, and it is what was invited.
  if ((await email.inputValue()) === '') await email.fill(who.email);
  await page.getByLabel('Password').fill(who.password);
  await page.getByLabel(/I agree to the Terms of Service/).check();
  await page.getByRole('button', { name: 'Create account' }).click();
}

export async function signIn(
  page: Page,
  who: Pick<Who, 'email' | 'password'>,
  returnTo = '/',
): Promise<void> {
  await page.goto(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
  await page.getByLabel('Email').fill(who.email);
  await page.getByLabel('Password').fill(who.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  // Wait for the session: a page asked for before it is set would be asked for as nobody.
  await expect(page).not.toHaveURL(/\/sign-in/);
}

/**
 * An invited person joins: the owner (signed in on `ownerPage`) invites the address, and the person follows the link
 * in a browser of their own and signs up. Returns them signed in.
 */
export async function join(
  browser: Browser,
  ownerPage: Page,
  who: Who,
): Promise<{ context: BrowserContext; page: Page }> {
  await ownerPage.goto('/console/invites');
  await ownerPage.getByLabel('Email address').fill(who.email);
  await ownerPage.getByRole('button', { name: 'Invite' }).click();
  const link = await ownerPage.locator('code').filter({ hasText: '/invite/' }).first().innerText();
  const person = await newPerson(browser);
  await person.page.goto(link);
  await signUp(person.page, who, person.page.url());
  await expect(heading(person.page)).toHaveText('Apps');
  return person;
}

export async function signOut(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/sign-in/);
}

/** A message the page shows (not Next's own announcer for screen readers, which is also a role=alert). */
export const alert = (page: Page) => page.locator('[role="alert"]:not(#__next-route-announcer__)');

/** The text of an `<h1>`: what page this is. */
export const heading = (page: Page) => page.getByRole('heading', { level: 1 });

export { freshAddress, PASSWORD };
