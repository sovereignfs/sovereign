// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { ChangePasswordForm } from '../components/Account/ChangePasswordForm';
import { LinkSovereignPanel } from '../components/Account/LinkSovereignPanel';
import { AuthButton } from '../components/Auth/AuthForm';
import { ForgotPasswordForm } from '../components/Auth/ForgotPasswordForm';
import { ResetPasswordForm } from '../components/Auth/ResetPasswordForm';
import { SignInForm } from '../components/Auth/SignInForm';
import { SignUpForm } from '../components/Auth/SignUpForm';
import { TwoFactorForm } from '../components/Auth/TwoFactorForm';

afterEach(cleanup);

const nothing = () => {};

/** Every form here that its script sends, and that a server can draw. */
const FORMS: [string, ReactElement][] = [
  ['SignInForm', <SignInForm appName="Acme" onSubmit={nothing} />],
  [
    'SignUpForm',
    <SignUpForm appName="Acme" passwordHint="" onSubmit={nothing} signInHref="/sign-in" />,
  ],
  [
    'ResetPasswordForm',
    <ResetPasswordForm
      passwordHint=""
      onSubmit={nothing}
      signInHref="/sign-in"
      newLinkHref="/forgot-password"
    />,
  ],
  ['ForgotPasswordForm', <ForgotPasswordForm onSubmit={nothing} signInHref="/sign-in" />],
  ['TwoFactorForm', <TwoFactorForm onSubmit={nothing} signInAgainHref="/sign-in" />],
  ['ChangePasswordForm', <ChangePasswordForm onSubmit={nothing} />],
  ['LinkSovereignPanel', <LinkSovereignPanel linked={false} onSubmit={nothing} />],
];

/** The page as a server sends it, before any script has run. */
function served(element: ReactElement): HTMLDivElement {
  const page = document.createElement('div');
  page.innerHTML = renderToString(element);
  return page;
}

const submitButtons = (page: Element) => [
  ...page.querySelectorAll<HTMLButtonElement>('button[type="submit"]'),
];

// A browser sends a form itself while no script has taken it over: a GET, with every named box in the address, passwords and all.
// A button that is off stops that, the Enter key included.
describe('a form its script sends', () => {
  it.each(FORMS)('%s cannot be sent from the page as the server sends it', (_name, element) => {
    const buttons = submitButtons(served(element));
    expect(buttons).toHaveLength(1);
    expect(buttons[0]?.disabled).toBe(true);
  });

  it.each(FORMS)('%s can be sent once the page is running', async (_name, element) => {
    const page = served(element);
    document.body.append(page);
    const root = await act(async () => hydrateRoot(page, element));
    expect(submitButtons(page)[0]?.disabled).toBe(false);
    act(() => root.unmount());
    page.remove();
  });
});

describe('AuthButton', () => {
  it('stays off after the page is running when the app turned it off', () => {
    render(
      <AuthButton type="submit" disabled>
        Send
      </AuthButton>,
    );
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Send' }).disabled).toBe(true);
  });

  it('waits for nothing when it sends no form', () => {
    const page = served(<AuthButton>Use a passkey</AuthButton>);
    expect(page.querySelector('button')?.disabled).toBe(false);
  });
});
