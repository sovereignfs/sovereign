// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TwoFactorForm } from '../TwoFactorForm';

afterEach(cleanup);

describe('TwoFactorForm', () => {
  it('hands over the six digits, or a backup code, and says when the mode changes', () => {
    const onSubmit = vi.fn();
    const onModeChange = vi.fn();
    render(
      <TwoFactorForm onSubmit={onSubmit} onModeChange={onModeChange} signInAgainHref="/sign-in" />,
    );
    '123456'
      .split('')
      .forEach((digit, at) =>
        fireEvent.change(screen.getByLabelText(`Digit ${at + 1}`), { target: { value: digit } }),
      );
    fireEvent.submit(screen.getByRole('button', { name: 'Verify' }));
    expect(onSubmit).toHaveBeenLastCalledWith({ code: '123456', backup: false });
    fireEvent.click(screen.getByRole('button', { name: 'Use a backup code' }));
    expect(onModeChange).toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Backup code'), { target: { value: ' abcd-efgh ' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Verify' }));
    expect(onSubmit).toHaveBeenLastCalledWith({ code: 'abcd-efgh', backup: true });
  });

  it('offers only signing in again once the sign-in cannot be finished', () => {
    render(<TwoFactorForm over onSubmit={() => undefined} signInAgainHref="/sign-in?x=1" />);
    expect(screen.queryByRole('button', { name: 'Verify' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Sign in again' }).getAttribute('href')).toBe(
      '/sign-in?x=1',
    );
  });
});
