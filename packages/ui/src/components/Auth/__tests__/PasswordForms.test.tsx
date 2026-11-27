// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fillUnannounced } from '../../../__tests__/fill-unannounced';
import { ForgotPasswordForm } from '../ForgotPasswordForm';
import { ResetPasswordForm } from '../ResetPasswordForm';

afterEach(cleanup);

describe('ForgotPasswordForm', () => {
  it('hands over the address, and once sent says the same for any address', () => {
    const onSubmit = vi.fn();
    const { rerender } = render(<ForgotPasswordForm onSubmit={onSubmit} signInHref="/sign-in" />);
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'ada@x.test' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Send reset link' }));
    expect(onSubmit).toHaveBeenCalledWith('ada@x.test');
    rerender(<ForgotPasswordForm sentTo="ada@x.test" onSubmit={onSubmit} signInHref="/sign-in" />);
    expect(screen.getByRole('status').textContent).toContain('If ada@x.test has an account');
    expect(screen.getByRole('link', { name: 'Back to sign in' }).getAttribute('href')).toBe(
      '/sign-in',
    );
  });
});

describe('ResetPasswordForm', () => {
  it('hands over the password typed twice, and offers a new link once this one has run out', () => {
    const onSubmit = vi.fn();
    const props = {
      passwordHint: 'At least 8.',
      onSubmit,
      signInHref: '/sign-in',
      newLinkHref: '/forgot',
    };
    const { rerender } = render(<ResetPasswordForm {...props} />);
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'one' } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'two' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Set new password' }));
    expect(onSubmit).toHaveBeenCalledWith({ password: 'one', confirm: 'two' });
    rerender(<ResetPasswordForm {...props} expired />);
    expect(screen.getByRole('link', { name: 'Request a new link' }).getAttribute('href')).toBe(
      '/forgot',
    );
  });

  it('hands over what is in the boxes when they were filled without a word to the page, and leaves it there', () => {
    const onSubmit = vi.fn();
    const form = (pending: boolean) => (
      <ResetPasswordForm
        passwordHint=""
        pending={pending}
        onSubmit={onSubmit}
        signInHref="/sign-in"
        newLinkHref="/forgot"
      />
    );
    const { rerender } = render(form(false));
    const box = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
    fillUnannounced(box('New password'), 'one');
    fillUnannounced(box('Confirm new password'), 'one');
    fireEvent.submit(screen.getByRole('button', { name: 'Set new password' }));
    expect(onSubmit).toHaveBeenCalledWith({ password: 'one', confirm: 'one' });
    rerender(form(true));
    rerender(form(false));
    expect(box('New password').value).toBe('one');
    expect(box('Confirm new password').value).toBe('one');
  });
});
