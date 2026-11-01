// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const signIn = vi.fn();
const signUp = vi.fn();
const sendVerificationEmail = vi.fn();
const requestPasswordReset = vi.fn();
const resetPassword = vi.fn();
vi.mock('../auth/client', () => ({
  authClient: {
    signIn: { email: (input: unknown) => signIn(input) as unknown },
    signUp: { email: (input: unknown) => signUp(input) as unknown },
    sendVerificationEmail: (input: unknown) => sendVerificationEmail(input) as unknown,
    requestPasswordReset: (input: unknown) => requestPasswordReset(input) as unknown,
    resetPassword: (input: unknown) => resetPassword(input) as unknown,
  },
}));

const { SignInForm } = await import('../../app/(auth)/sign-in/sign-in-form');
const { SignUpForm } = await import('../../app/(auth)/sign-up/sign-up-form');
const { ForgotPasswordForm } =
  await import('../../app/(auth)/forgot-password/forgot-password-form');
const { ResetPasswordForm } = await import('../../app/(auth)/reset-password/reset-password-form');

const assign = vi.fn();
beforeEach(() => {
  signIn.mockReset();
  signUp.mockReset();
  sendVerificationEmail.mockReset();
  requestPasswordReset.mockReset();
  resetPassword.mockReset();
  assign.mockReset();
  vi.stubGlobal('location', { ...window.location, assign });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(new RegExp(`^${label}`)), { target: { value } });

describe('the sign-in form', () => {
  it('sends the email and password, then goes where the person was headed', async () => {
    signIn.mockResolvedValue({ data: {}, error: null });
    render(<SignInForm instanceName="Acme" returnTo="/settings" />);
    type('Email', 'ada@sovereign.local');
    type('Password', 'correct horse battery');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/settings'));
    expect(signIn).toHaveBeenCalledWith({
      email: 'ada@sovereign.local',
      password: 'correct horse battery',
    });
  });

  it('says only that the email or password is incorrect, whatever the reason', async () => {
    signIn.mockResolvedValue({ data: null, error: { status: 401, code: 'USER_NOT_FOUND' } });
    render(<SignInForm instanceName="Acme" returnTo="/" />);
    type('Email', 'nobody@sovereign.local');
    type('Password', 'whatever');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      expect.stringContaining('The email or password is incorrect.'),
    );
    expect(assign).not.toHaveBeenCalled();
  });

  it('says to wait when the limit is reached', async () => {
    signIn.mockResolvedValue({ data: null, error: { status: 429 } });
    render(<SignInForm instanceName="Acme" returnTo="/" />);
    type('Email', 'ada@sovereign.local');
    type('Password', 'whatever');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText(/Too many attempts/)).toBeTruthy();
  });

  it('keeps what was typed after a failure', async () => {
    signIn.mockResolvedValue({ data: null, error: { status: 401 } });
    render(<SignInForm instanceName="Acme" returnTo="/" />);
    type('Email', 'ada@sovereign.local');
    type('Password', 'wrong');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByRole('alert');
    expect((screen.getByLabelText(/^Email/) as HTMLInputElement).value).toBe('ada@sovereign.local');
  });
});

describe('the sign-up form', () => {
  const fill = () => {
    type('Name', 'Ada Lovelace');
    type('Email', 'ada@sovereign.local');
    type('Password', 'correct horse battery');
    type('Confirm password', 'correct horse battery');
    fireEvent.click(screen.getByLabelText(/I agree to the/));
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
  };

  it('will not send the sign-up until the terms are accepted, and says why', () => {
    render(<SignUpForm instanceName="Acme" returnTo="/" passwordHint="" />);
    type('Name', 'Ada Lovelace');
    type('Email', 'ada@sovereign.local');
    type('Password', 'correct horse battery');
    type('Confirm password', 'correct horse battery');
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByRole('alert').textContent).toContain('Accept the Terms of Service');
    expect(signUp).not.toHaveBeenCalled();
  });

  it('links to both documents, in a new tab so the form is not lost', () => {
    render(<SignUpForm instanceName="Acme" returnTo="/" passwordHint="" />);
    for (const [name, href] of [
      ['Terms of Service', '/tos'],
      ['Privacy Policy', '/privacy'],
    ]) {
      const link = screen.getByRole('link', { name });
      expect(link.getAttribute('href')).toBe(href);
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toContain('noopener');
    }
  });

  it('will not send the sign-up when the two passwords differ, and says so', () => {
    render(<SignUpForm instanceName="Acme" returnTo="/" passwordHint="" />);
    type('Name', 'Ada Lovelace');
    type('Email', 'ada@sovereign.local');
    type('Password', 'correct horse battery');
    type('Confirm password', 'correct horse batteri');
    fireEvent.click(screen.getByLabelText(/I agree to the/));
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByRole('alert').textContent).toContain('do not match');
    expect(signUp).not.toHaveBeenCalled();
  });

  it('shows the password rules beside the field', () => {
    render(<SignUpForm instanceName="Acme" returnTo="/" passwordHint="At least 12 characters." />);
    expect(screen.getByText('At least 12 characters.')).toBeTruthy();
  });

  it('sends the name, email and password, then goes where the person was headed', async () => {
    signUp.mockResolvedValue({ data: { token: 'abc' }, error: null });
    render(<SignUpForm instanceName="Acme" returnTo="/settings" passwordHint="" />);
    fill();
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/settings'));
    expect(signUp).toHaveBeenCalledWith({
      name: 'Ada Lovelace',
      email: 'ada@sovereign.local',
      password: 'correct horse battery',
      agreedToTerms: true,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      callbackURL: '/sign-in?returnTo=%2Fsettings',
    });
  });

  it('shows the server’s own words when the password breaks the rules', async () => {
    signUp.mockResolvedValue({
      data: null,
      error: {
        status: 400,
        code: 'PASSWORD_DOES_NOT_MEET_POLICY',
        message: 'The password must include a number.',
      },
    });
    render(<SignUpForm instanceName="Acme" returnTo="/" passwordHint="" />);
    fill();
    expect(await screen.findByText('The password must include a number.')).toBeTruthy();
    expect(assign).not.toHaveBeenCalled();
  });

  it('suggests signing in when the address already has an account', async () => {
    signUp.mockResolvedValue({ data: null, error: { status: 422, code: 'USER_ALREADY_EXISTS' } });
    render(<SignUpForm instanceName="Acme" returnTo="/" passwordHint="" />);
    fill();
    expect(await screen.findByText(/already exists/)).toBeTruthy();
  });

  it('explains that sign-up is by invitation when the server says so', async () => {
    signUp.mockResolvedValue({
      data: null,
      error: { status: 422, code: 'INVITE_REQUIRED', message: 'Sign-up needs an invitation.' },
    });
    render(<SignUpForm instanceName="Acme" returnTo="/" passwordHint="" />);
    fill();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('no valid invitation for this email address');
    expect(alert.textContent).toContain('Ask whoever runs this instance');
    expect(assign).not.toHaveBeenCalled();
  });

  it('gives a plain message for anything else, never the raw error', async () => {
    signUp.mockResolvedValue({
      data: null,
      error: {
        status: 500,
        code: 'FAILED_TO_CREATE_USER',
        message: 'SQLITE_CONSTRAINT: users.email',
      },
    });
    render(<SignUpForm instanceName="Acme" returnTo="/" passwordHint="" />);
    fill();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('could not be created');
    expect(alert.textContent).not.toContain('SQLITE');
  });
});

describe('the sign-in form, around verification and reset', () => {
  const submit = () => {
    type('Email', 'ada@sovereign.local');
    type('Password', 'correct horse battery');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  };

  it('goes to the second step, not home, when the password was right but a code is wanted', async () => {
    signIn.mockResolvedValue({ data: { twoFactorRedirect: true }, error: null });
    render(<SignInForm instanceName="Acme" returnTo="/settings?tab=mail" />);
    submit();
    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith('/sign-in/two-factor?returnTo=%2Fsettings%3Ftab%3Dmail'),
    );
    expect(assign).not.toHaveBeenCalledWith('/settings?tab=mail');
  });

  it('says the account is deactivated, in plain words, after the right password', async () => {
    signIn.mockResolvedValue({ data: null, error: { status: 403, code: 'ACCOUNT_DEACTIVATED' } });
    render(<SignInForm instanceName="Acme" returnTo="/" />);
    submit();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('has been deactivated');
    expect(alert.textContent).toContain('Ask whoever runs this instance');
    expect(screen.queryByRole('button', { name: 'Send a new link' })).toBeNull();
    expect(assign).not.toHaveBeenCalled();
  });

  it('offers a way to reset a forgotten password', () => {
    render(<SignInForm instanceName="Acme" returnTo="/" />);
    expect(screen.getByRole('link', { name: 'Forgot password?' }).getAttribute('href')).toBe(
      '/forgot-password',
    );
  });

  it('asks for the address to be verified, and offers a new link, when the server says so', async () => {
    signIn.mockResolvedValue({
      data: null,
      error: { status: 403, code: 'EMAIL_NOT_VERIFIED', message: 'Email not verified' },
    });
    sendVerificationEmail.mockResolvedValue({ data: { status: true }, error: null });
    render(<SignInForm instanceName="Acme" returnTo="/settings" />);
    submit();
    expect(await screen.findByText(/Verify your email address before signing in/)).toBeTruthy();
    expect(screen.queryByText('The email or password is incorrect.')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Send a new link' }));
    expect(await screen.findByText(/A new link is on its way to ada@sovereign.local/)).toBeTruthy();
    expect(sendVerificationEmail).toHaveBeenCalledWith({
      email: 'ada@sovereign.local',
      callbackURL: '/sign-in?returnTo=%2Fsettings',
    });
    expect(assign).not.toHaveBeenCalled();
  });

  it('says so when a new link cannot be sent', async () => {
    signIn.mockResolvedValue({ data: null, error: { status: 403, code: 'EMAIL_NOT_VERIFIED' } });
    sendVerificationEmail.mockResolvedValue({
      data: null,
      error: { status: 503, code: 'EMAIL_NOT_AVAILABLE' },
    });
    render(<SignInForm instanceName="Acme" returnTo="/" />);
    submit();
    fireEvent.click(await screen.findByRole('button', { name: 'Send a new link' }));
    expect(await screen.findByText(/Email isn't set up on this instance/)).toBeTruthy();
  });

  it('tells the person who has just signed out that they have', () => {
    render(<SignInForm instanceName="Acme" returnTo="/" notice="signed-out" />);
    expect(screen.getByRole('status').textContent).toContain('You’ve been signed out.');
  });

  it('tells the person who just changed their password to sign in', () => {
    render(<SignInForm instanceName="Acme" returnTo="/" notice="password-changed" />);
    expect(screen.getByText(/Your password is changed/)).toBeTruthy();
  });

  it('tells the person who has just deleted their account that nothing of it is kept', () => {
    render(<SignInForm instanceName="Acme" returnTo="/" notice="account-deleted" />);
    expect(screen.getByText(/Your account is deleted. Nothing of it is kept./)).toBeTruthy();
  });

  it('explains a link that did not work, and what to do', () => {
    render(<SignInForm instanceName="Acme" returnTo="/" notice="link-invalid" />);
    expect(screen.getByText(/expired or was already used/)).toBeTruthy();
  });
});

describe('the sign-in form, when an app sent the person here', () => {
  const REQUEST = '?client_id=abc&response_type=code&scope=openid&sig=signed';
  const APP = 'https://rp.sovereign.local/cb?code=one&state=two';
  const submit = () => {
    type('Email', 'ada@sovereign.local');
    type('Password', 'correct horse battery');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  };
  beforeEach(() => {
    vi.stubGlobal('location', { ...window.location, assign, search: REQUEST });
  });

  it('goes back to the app, with its code, rather than to where the person was headed', async () => {
    signIn.mockResolvedValue({ data: { redirect: true, url: APP }, error: null });
    render(<SignInForm instanceName="Acme" returnTo="/" />);
    submit();
    await waitFor(() => expect(assign).toHaveBeenCalledWith(APP));
    expect(assign).not.toHaveBeenCalledWith('/');
  });

  it('carries the app’s request to the second step, so that step can carry on with it', async () => {
    signIn.mockResolvedValue({ data: { twoFactorRedirect: true }, error: null });
    render(<SignInForm instanceName="Acme" returnTo="/" />);
    submit();
    await waitFor(() => expect(assign).toHaveBeenCalledWith(`/sign-in/two-factor${REQUEST}`));
  });

  it('is the ordinary sign-in when the provider says nothing', async () => {
    signIn.mockResolvedValue({ data: {}, error: null });
    render(<SignInForm instanceName="Acme" returnTo="/settings" />);
    submit();
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/settings'));
  });

  it('does not carry anything to the second step on an ordinary visit', async () => {
    vi.stubGlobal('location', { ...window.location, assign, search: '?returnTo=%2Fsettings' });
    signIn.mockResolvedValue({ data: { twoFactorRedirect: true }, error: null });
    render(<SignInForm instanceName="Acme" returnTo="/settings" />);
    submit();
    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith('/sign-in/two-factor?returnTo=%2Fsettings'),
    );
  });
});

describe('the sign-up form, while the address is not verified', () => {
  const fill = () => {
    type('Name', 'Ada Lovelace');
    type('Email', 'ada@sovereign.local');
    type('Password', 'correct horse battery');
    type('Confirm password', 'correct horse battery');
    fireEvent.click(screen.getByLabelText(/I agree to the/));
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
  };

  it('points to the inbox when the server made no session, and asks for the link to land on sign-in', async () => {
    signUp.mockResolvedValue({ data: { token: null, user: {} }, error: null });
    render(<SignUpForm instanceName="Acme" returnTo="/settings" passwordHint="" />);
    fill();
    expect(await screen.findByText(/We have sent a link to ada@sovereign.local/)).toBeTruthy();
    expect(screen.queryByLabelText(/^Password/)).toBeNull();
    expect(assign).not.toHaveBeenCalled();
    expect(signUp).toHaveBeenCalledWith(
      expect.objectContaining({ callbackURL: '/sign-in?returnTo=%2Fsettings' }),
    );
    expect(screen.getByRole('link', { name: 'Back to sign in' })).toBeTruthy();
  });

  it('asks for a new link on request', async () => {
    signUp.mockResolvedValue({ data: { token: null, user: {} }, error: null });
    sendVerificationEmail.mockResolvedValue({ data: { status: true }, error: null });
    render(<SignUpForm instanceName="Acme" returnTo="/" passwordHint="" />);
    fill();
    fireEvent.click(await screen.findByRole('button', { name: 'Send a new link' }));
    expect(await screen.findByText(/A new link is on its way/)).toBeTruthy();
    expect(sendVerificationEmail).toHaveBeenCalledWith({
      email: 'ada@sovereign.local',
      callbackURL: '/sign-in',
    });
  });

  it('goes straight on when the server signed the person in', async () => {
    signUp.mockResolvedValue({ data: { token: 'abc', user: {} }, error: null });
    render(<SignUpForm instanceName="Acme" returnTo="/" passwordHint="" />);
    fill();
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/'));
  });

  it('shows the server’s words when it refuses for the terms', async () => {
    signUp.mockResolvedValue({
      data: null,
      error: { status: 400, code: 'TERMS_NOT_ACCEPTED', message: 'You must accept the terms.' },
    });
    render(<SignUpForm instanceName="Acme" returnTo="/" passwordHint="" />);
    fill();
    expect(await screen.findByText('You must accept the terms.')).toBeTruthy();
  });

  it('says so, plainly, when the browser’s time zone is refused', async () => {
    signUp.mockResolvedValue({ data: null, error: { status: 400, code: 'INVALID_TIMEZONE' } });
    render(<SignUpForm instanceName="Acme" returnTo="/" passwordHint="" />);
    fill();
    expect((await screen.findByRole('alert')).textContent).toContain('time zone');
  });

  it('says when email is not set up, instead of a vague failure', async () => {
    signUp.mockResolvedValue({ data: null, error: { status: 503, code: 'EMAIL_NOT_AVAILABLE' } });
    render(<SignUpForm instanceName="Acme" returnTo="/" passwordHint="" />);
    fill();
    expect((await screen.findByRole('alert')).textContent).toContain("Email isn't set up");
  });
});

describe('the forgot-password form', () => {
  const submit = () => {
    type('Email', 'ada@sovereign.local');
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
  };

  it('asks for the link to land on core’s reset page, and says the same whoever the address is', async () => {
    requestPasswordReset.mockResolvedValue({ data: { status: true }, error: null });
    render(<ForgotPasswordForm />);
    submit();
    expect(await screen.findByText(/If ada@sovereign.local has an account/)).toBeTruthy();
    expect(requestPasswordReset).toHaveBeenCalledWith({
      email: 'ada@sovereign.local',
      redirectTo: '/reset-password',
    });
  });

  it('says when email is not set up', async () => {
    requestPasswordReset.mockResolvedValue({
      data: null,
      error: { status: 503, code: 'EMAIL_NOT_AVAILABLE' },
    });
    render(<ForgotPasswordForm />);
    submit();
    expect((await screen.findByRole('alert')).textContent).toContain("Email isn't set up");
  });

  it('says to wait when the limit is reached', async () => {
    requestPasswordReset.mockResolvedValue({ data: null, error: { status: 429 } });
    render(<ForgotPasswordForm />);
    submit();
    expect(await screen.findByText(/Too many requests/)).toBeTruthy();
  });
});

describe('the reset-password form', () => {
  const submit = (password = 'a different long passphrase', confirm = password) => {
    type('New password', password);
    type('Confirm new password', confirm);
    fireEvent.click(screen.getByRole('button', { name: 'Set new password' }));
  };

  it('sends the token with the new password, then goes to sign-in', async () => {
    resetPassword.mockResolvedValue({ data: { status: true }, error: null });
    render(<ResetPasswordForm token="tok123" passwordHint="At least 8 characters." />);
    expect(screen.getByText('At least 8 characters.')).toBeTruthy();
    submit();
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/sign-in?reset=1'));
    expect(resetPassword).toHaveBeenCalledWith({
      newPassword: 'a different long passphrase',
      token: 'tok123',
    });
  });

  it('shows the server’s own words when the password breaks the rules, and keeps the form', async () => {
    resetPassword.mockResolvedValue({
      data: null,
      error: {
        status: 400,
        code: 'PASSWORD_DOES_NOT_MEET_POLICY',
        message: 'The password must include a number.',
      },
    });
    render(<ResetPasswordForm token="tok123" passwordHint="" />);
    submit('weak');
    expect(await screen.findByText('The password must include a number.')).toBeTruthy();
    expect(assign).not.toHaveBeenCalled();
    expect((screen.getByLabelText(/^New password/) as HTMLInputElement).value).toBe('weak');
  });

  it('does not send the new password when the two differ, and says so', () => {
    render(<ResetPasswordForm token="tok123" passwordHint="" />);
    submit('a different long passphrase', 'another long passphrase');
    expect(screen.getByRole('alert').textContent).toContain('do not match');
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it('says the link is no longer good, and where to ask for another', async () => {
    resetPassword.mockResolvedValue({ data: null, error: { status: 400, code: 'INVALID_TOKEN' } });
    render(<ResetPasswordForm token="old" passwordHint="" />);
    submit();
    expect(await screen.findByText(/expired or was already used/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Request a new link' }).getAttribute('href')).toBe(
      '/forgot-password',
    );
  });
});
