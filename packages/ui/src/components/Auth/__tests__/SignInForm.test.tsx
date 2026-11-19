// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SignInForm } from '../SignInForm';

afterEach(cleanup);

describe('SignInForm', () => {
  it('collects the email and password and hands them over, sending nothing itself', () => {
    const onSubmit = vi.fn();
    render(
      <SignInForm
        appName="Acme"
        onSubmit={onSubmit}
        forgotPasswordHref="/forgot-password"
        signUpHref="/sign-up"
      />,
    );
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ada@acme.test' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Sign in' }));
    expect(onSubmit).toHaveBeenCalledWith({ email: 'ada@acme.test', password: 'secret' });
    expect(screen.getByRole('link', { name: 'Create account' }).getAttribute('href')).toBe(
      '/sign-up',
    );
    expect(screen.getByText(/New to Acme\?/)).toBeTruthy();
  });

  it('draws links with the consumer’s renderer, and offers a passkey only when given one', () => {
    const renderLink = vi.fn(({ href, children }: { href: string; children?: unknown }) => (
      <a href={href} data-router="yes">
        {children as string}
      </a>
    ));
    const { rerender } = render(
      <SignInForm
        appName="Acme"
        onSubmit={() => undefined}
        forgotPasswordHref="/forgot"
        renderLink={renderLink}
      />,
    );
    expect(screen.getByRole('link', { name: 'Forgot password?' }).dataset.router).toBe('yes');
    expect(screen.queryByRole('button', { name: 'Sign in with a passkey' })).toBeNull();
    expect(screen.queryByText('Create account')).toBeNull();
    const onClick = vi.fn();
    rerender(
      <SignInForm
        appName="Acme"
        onSubmit={() => undefined}
        forgotPasswordHref="/forgot"
        passkey={{ pending: false, onClick }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with a passkey' }));
    expect(onClick).toHaveBeenCalled();
  });

  it('says what went wrong, and what to do about an address to verify', () => {
    render(
      <SignInForm
        appName="Acme"
        error="The email or password is incorrect."
        unverified
        renderUnverified={(email) => <p>Send again to {email || 'the address'}</p>}
        pending
        onSubmit={() => undefined}
        forgotPasswordHref="/forgot"
      />,
    );
    expect(screen.getByRole('alert').textContent).toBe('The email or password is incorrect.');
    expect(screen.getByText(/Verify your email address/)).toBeTruthy();
    expect(screen.getByText('Send again to the address')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Signing in…' })).toBeTruthy();
  });
});
