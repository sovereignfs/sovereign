// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const signIn = vi.fn();
const signUp = vi.fn();
vi.mock('../auth/client', () => ({
  authClient: {
    signIn: { email: (input: unknown) => signIn(input) as unknown },
    signUp: { email: (input: unknown) => signUp(input) as unknown },
  },
}));

const { SignInForm } = await import('../../app/(auth)/sign-in/sign-in-form');
const { SignUpForm } = await import('../../app/(auth)/sign-up/sign-up-form');

const assign = vi.fn();
beforeEach(() => {
  signIn.mockReset();
  signUp.mockReset();
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
    render(<SignInForm returnTo="/settings" />);
    type('Email', 'ada@example.com');
    type('Password', 'correct horse battery');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/settings'));
    expect(signIn).toHaveBeenCalledWith({
      email: 'ada@example.com',
      password: 'correct horse battery',
    });
  });

  it('says only that the email or password is incorrect, whatever the reason', async () => {
    signIn.mockResolvedValue({ data: null, error: { status: 401, code: 'USER_NOT_FOUND' } });
    render(<SignInForm returnTo="/" />);
    type('Email', 'nobody@example.com');
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
    render(<SignInForm returnTo="/" />);
    type('Email', 'ada@example.com');
    type('Password', 'whatever');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText(/Too many attempts/)).toBeTruthy();
  });

  it('keeps what was typed after a failure', async () => {
    signIn.mockResolvedValue({ data: null, error: { status: 401 } });
    render(<SignInForm returnTo="/" />);
    type('Email', 'ada@example.com');
    type('Password', 'wrong');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByRole('alert');
    expect((screen.getByLabelText(/^Email/) as HTMLInputElement).value).toBe('ada@example.com');
  });
});

describe('the sign-up form', () => {
  const fill = () => {
    type('Name', 'Ada Lovelace');
    type('Email', 'ada@example.com');
    type('Password', 'correct horse battery');
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
  };

  it('shows the password rules beside the field', () => {
    render(<SignUpForm returnTo="/" passwordHint="At least 12 characters." />);
    expect(screen.getByText('At least 12 characters.')).toBeTruthy();
  });

  it('sends the name, email and password, then goes where the person was headed', async () => {
    signUp.mockResolvedValue({ data: {}, error: null });
    render(<SignUpForm returnTo="/settings" passwordHint="" />);
    fill();
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/settings'));
    expect(signUp).toHaveBeenCalledWith({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      password: 'correct horse battery',
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
    render(<SignUpForm returnTo="/" passwordHint="" />);
    fill();
    expect(await screen.findByText('The password must include a number.')).toBeTruthy();
    expect(assign).not.toHaveBeenCalled();
  });

  it('suggests signing in when the address already has an account', async () => {
    signUp.mockResolvedValue({ data: null, error: { status: 422, code: 'USER_ALREADY_EXISTS' } });
    render(<SignUpForm returnTo="/" passwordHint="" />);
    fill();
    expect(await screen.findByText(/already exists/)).toBeTruthy();
  });

  it('explains that sign-up is by invitation when the server says so', async () => {
    signUp.mockResolvedValue({
      data: null,
      error: { status: 403, code: 'INVITE_REQUIRED', message: 'Sign-up needs an invitation.' },
    });
    render(<SignUpForm returnTo="/" passwordHint="" />);
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
    render(<SignUpForm returnTo="/" passwordHint="" />);
    fill();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('could not be created');
    expect(alert.textContent).not.toContain('SQLITE');
  });
});
