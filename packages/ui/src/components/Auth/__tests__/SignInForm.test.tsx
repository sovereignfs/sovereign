// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SignInForm } from '../SignInForm';

afterEach(cleanup);

const box = (label: string) => screen.getByLabelText(label) as HTMLInputElement;

/**
 * Fills a box as a password manager can (AutoFill on iOS): the value is there to see, and the page is told nothing. The
 * prototype's setter is used because React watches the element's own.
 */
function fillUnannounced(label: string, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
    box(label),
    value,
  );
}

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

  it('hands over what is in the boxes when they were filled without a word to the page', () => {
    const onSubmit = vi.fn();
    render(<SignInForm appName="Acme" onSubmit={onSubmit} />);
    fillUnannounced('Email', 'ada@acme.test');
    fillUnannounced('Password', 'secret');
    fireEvent.submit(screen.getByRole('button', { name: 'Sign in' }));
    expect(onSubmit).toHaveBeenCalledWith({ email: 'ada@acme.test', password: 'secret' });
  });

  it('leaves in the boxes what was filled into them, however often it is drawn again', () => {
    const onSubmit = vi.fn();
    const { rerender } = render(<SignInForm appName="Acme" onSubmit={onSubmit} />);
    fillUnannounced('Email', 'ada@acme.test');
    fillUnannounced('Password', 'secret');
    rerender(<SignInForm appName="Acme" onSubmit={onSubmit} pending />);
    rerender(<SignInForm appName="Acme" onSubmit={onSubmit} error="Try again." />);
    expect(box('Email').value).toBe('ada@acme.test');
    expect(box('Password').value).toBe('secret');
  });

  it('gives the address to verify as it was sent, also when the page heard nothing of it', () => {
    const form = (unverified: boolean) => (
      <SignInForm
        appName="Acme"
        onSubmit={() => undefined}
        unverified={unverified}
        renderUnverified={(email) => <p>Send again to {email}</p>}
      />
    );
    const { rerender } = render(form(false));
    fillUnannounced('Email', 'ada@acme.test');
    fillUnannounced('Password', 'secret');
    fireEvent.submit(screen.getByRole('button', { name: 'Sign in' }));
    rerender(form(true));
    expect(screen.getByText('Send again to ada@acme.test')).toBeTruthy();
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

  it('offers no reset link where the app cannot send one, and other ways in where it has them', () => {
    render(
      <SignInForm
        appName="Acme"
        onSubmit={() => undefined}
        otherWays={<a href="/api/auth/sign-in/sovereign">Continue with Sovereign</a>}
      />,
    );
    expect(screen.queryByRole('link', { name: 'Forgot password?' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Continue with Sovereign' })).toBeTruthy();
  });
});
