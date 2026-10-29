// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const signOut = vi.fn();
vi.mock('../auth/client', () => ({ authClient: { signOut: () => signOut() as unknown } }));

const { SignOutButton } = await import('../../app/sign-out-button');

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('the sign-out button', () => {
  it('ends the session, then goes to sign-in saying so, with a full navigation', async () => {
    signOut.mockResolvedValue({ data: { success: true }, error: null });
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    render(<SignOutButton />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/sign-in?signedout=1'));
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
