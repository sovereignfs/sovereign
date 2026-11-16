import { expect, test, type BrowserContext } from '@playwright/test';
import { CORE_URL, freshAddress, person, signInValueFor } from '../support/env';
import { heading, newPerson, signIn, signUp } from '../support/ui';

const owner = person('Olive');
const reader = person('Sigrid');
const NEW_PASSWORD = 'Another-Acceptance-7Kp';

/** Every request body a browser sends, as text, from now on. */
function record(context: BrowserContext): string[] {
  const bodies: string[] = [];
  context.on('request', (request) => {
    const body = request.postData();
    if (body) bodies.push(body);
  });
  return bodies;
}

/**
 * Core never receives a password (core-app §5.2): every form that sets or asks for one sends the sign-in value the page derives
 * from it. Followed here through sign-up by invitation, sign-in, a change of password, and the password asked again to delete the
 * account.
 */
test('§5.10.1: no request of any password flow carries a password', async ({ browser }) => {
  const operator = await newPerson(browser);
  await signIn(operator.page, owner, '/console/invites');
  await operator.page.getByLabel('Email address').fill(reader.email);
  await operator.page.getByRole('button', { name: 'Invite' }).click();
  const link = await operator.page
    .locator('code')
    .filter({ hasText: '/invite/' })
    .first()
    .innerText();
  await operator.context.close();

  // Sign-up, through the invitation.
  const joining = await newPerson(browser);
  const atSignUp = record(joining.context);
  await joining.page.goto(link);
  await signUp(joining.page, reader, joining.page.url());
  await expect(heading(joining.page)).toHaveText('Apps');
  await joining.context.close();

  // The value the browser derived is the one Node derives from the same password, address and instance id: core takes it.
  const direct = await fetch(`${CORE_URL}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: {
      origin: CORE_URL,
      'content-type': 'application/json',
      'x-forwarded-for': freshAddress(),
    },
    body: JSON.stringify({
      email: reader.email,
      password: await signInValueFor(reader.password, reader.email),
    }),
  });
  expect(direct.status).toBe(200);

  // Sign-in, in a browser of its own, then a change of password and the password asked again.
  const { context, page } = await newPerson(browser);
  const afterwards = record(context);
  await signIn(page, reader);

  await page.goto('/security');
  await page.getByLabel('Current password').fill(reader.password);
  await page.getByLabel('New password').fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByText(/signed out everywhere else/)).toBeVisible();

  await page.goto('/delete-account');
  await page.getByLabel('Your password').fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Delete my account…' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete my account' }).click();
  await expect(page).not.toHaveURL(/\/delete-account/);
  await context.close();

  const sent = [...atSignUp, ...afterwards].join('\n');
  for (const password of [reader.password, NEW_PASSWORD]) {
    expect(sent).not.toContain(password);
    expect(sent).not.toContain(encodeURIComponent(password));
  }
  // What stood for each password was a sign-in value.
  expect(sent).toMatch(/svp1\.[A-Za-z0-9_-]{43}/);
});
