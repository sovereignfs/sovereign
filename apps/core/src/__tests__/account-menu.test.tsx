// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ToastProvider } from '@sovereignfs/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const signOut = vi.fn();
vi.mock('../auth/client', () => ({ authClient: { signOut: () => signOut() as unknown } }));
const forgetKeys = vi.fn(async () => undefined);
vi.mock('../keys/session', () => ({ forgetKeys: () => forgetKeys() }));

const { AccountMenu } = await import('../../app/account-menu');

const assign = vi.fn();
beforeEach(() => {
  signOut.mockReset();
  forgetKeys.mockClear();
  assign.mockReset();
  vi.stubGlobal('location', { ...window.location, assign });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const signOutFromMenu = () => {
  render(
    <ToastProvider>
      <AccountMenu name="Ada Lovelace" email="ada@sovereign.local" avatarUrl={undefined} />
    </ToastProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Your account' }));
  fireEvent.click(screen.getByRole('menuitem', { name: /Sign out/ }));
};

describe('signing out from the account menu', () => {
  it('goes to the sign-in page, saying so, once the session has ended', async () => {
    signOut.mockResolvedValue({ data: { success: true }, error: null });
    signOutFromMenu();
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/sign-in?signedout=1'));
    expect(forgetKeys).toHaveBeenCalled();
  });

  it('says the person is still signed in when the server refused, and stays', async () => {
    signOut.mockResolvedValue({ data: null, error: { status: 500 } });
    signOutFromMenu();
    expect(await screen.findByText('You are still signed in')).toBeTruthy();
    expect(assign).not.toHaveBeenCalled();
  });

  it('says the same when the request never reached the server, and can be tried again', async () => {
    signOut.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    signOutFromMenu();
    expect(await screen.findByText('You are still signed in')).toBeTruthy();
    expect(assign).not.toHaveBeenCalled();
    signOut.mockResolvedValue({ data: { success: true }, error: null });
    fireEvent.click(screen.getByRole('button', { name: 'Your account' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Sign out/ }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/sign-in?signedout=1'));
  });
});
