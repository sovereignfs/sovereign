// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const addPasskey = vi.fn();
const updatePasskey = vi.fn();
const deletePasskey = vi.fn();
const signInPasskey = vi.fn();
const signInEmail = vi.fn();
vi.mock('../auth/client', () => ({
  authClient: {
    signIn: {
      email: (input: unknown) => signInEmail(input) as unknown,
      passkey: () => signInPasskey() as unknown,
    },
    passkey: {
      addPasskey: (input: unknown) => addPasskey(input) as unknown,
      updatePasskey: (input: unknown) => updatePasskey(input) as unknown,
      deletePasskey: (input: unknown) => deletePasskey(input) as unknown,
    },
  },
}));

const { PasskeyPanel } = await import('../../app/security/passkeys/passkey-panel');
const { SignInForm } = await import('../../app/(auth)/sign-in/sign-in-form');

const assign = vi.fn();
const reload = vi.fn();
const rows = [
  { id: 'p1', name: 'Work laptop', createdAt: '2026-10-01T09:00:00.000Z', synced: true },
  { id: 'p2', name: null, createdAt: null, synced: false },
];

beforeEach(() => {
  for (const mock of [addPasskey, updatePasskey, deletePasskey, signInPasskey, signInEmail]) {
    mock.mockReset();
  }
  assign.mockReset();
  reload.mockReset();
  vi.stubGlobal('location', { ...window.location, assign, reload });
  vi.stubGlobal('PublicKeyCredential', function PublicKeyCredential() {});
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(new RegExp(`^${label}`)), { target: { value } });
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));

describe('the passkeys panel', () => {
  it('says there are none, with a way to add one', () => {
    render(<PasskeyPanel passkeys={[]} />);
    expect(screen.getByText('You have no passkeys')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add a passkey' })).toBeTruthy();
  });

  it('lists each passkey with its name, when it was added, and whether it syncs', () => {
    render(<PasskeyPanel passkeys={rows} />);
    expect(screen.getByText('Your passkeys')).toBeTruthy();
    expect(screen.getByText('Work laptop')).toBeTruthy();
    expect(screen.getByText(/Synced between your devices/)).toBeTruthy();
    expect(screen.getByText('Passkey')).toBeTruthy();
    expect(screen.getByText('Stays on one device.')).toBeTruthy();
  });

  it('adds one with the name given, then reloads to show it', async () => {
    addPasskey.mockResolvedValue({ data: { id: 'new' }, error: null });
    render(<PasskeyPanel passkeys={[]} />);
    type('Name', '  Phone ');
    click('Add a passkey');
    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(addPasskey).toHaveBeenCalledWith({ name: 'Phone' });
  });

  it('adds one with no name when none is given', async () => {
    addPasskey.mockResolvedValue({ data: { id: 'new' }, error: null });
    render(<PasskeyPanel passkeys={[]} />);
    click('Add a passkey');
    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(addPasskey).toHaveBeenCalledWith({ name: undefined });
  });

  it('says so when the device already has a passkey for the site, and does not reload', async () => {
    addPasskey.mockResolvedValue({
      data: null,
      error: { status: 400, code: 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED' },
    });
    render(<PasskeyPanel passkeys={[]} />);
    click('Add a passkey');
    expect((await screen.findByRole('alert')).textContent).toContain('already has a passkey');
    expect(reload).not.toHaveBeenCalled();
  });

  it('says a device that was not unlocked is not accepted, in the server’s words', async () => {
    addPasskey.mockResolvedValue({
      data: null,
      error: { status: 400, code: 'PASSKEY_NOT_UNLOCKED', message: 'Use one that asks for a PIN.' },
    });
    render(<PasskeyPanel passkeys={[]} />);
    click('Add a passkey');
    expect(await screen.findByText('Use one that asks for a PIN.')).toBeTruthy();
  });

  it('offers nothing to add, and says why, in a browser without passkeys', async () => {
    vi.stubGlobal('PublicKeyCredential', undefined);
    render(<PasskeyPanel passkeys={[]} />);
    expect(await screen.findByText(/cannot make passkeys/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add a passkey' })).toBeNull();
  });

  it('renames a passkey, and reloads', async () => {
    updatePasskey.mockResolvedValue({ data: {}, error: null });
    render(<PasskeyPanel passkeys={[rows[0] as (typeof rows)[number]]} />);
    click('Rename');
    // the rename form comes first; the form for adding another passkey is below it
    fireEvent.change(screen.getAllByLabelText(/^Name/)[0] as HTMLElement, {
      target: { value: 'Old laptop' },
    });
    click('Save');
    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(updatePasskey).toHaveBeenCalledWith({ id: 'p1', name: 'Old laptop' });
  });

  it('asks twice before removing a passkey, and can be talked out of it', () => {
    render(<PasskeyPanel passkeys={[rows[0] as (typeof rows)[number]]} />);
    click('Remove');
    expect(screen.getByRole('button', { name: 'Remove Work laptop' })).toBeTruthy();
    click('Keep it');
    expect(deletePasskey).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Rename' })).toBeTruthy();
  });

  it('removes a passkey once confirmed, and reloads', async () => {
    deletePasskey.mockResolvedValue({ data: { status: true }, error: null });
    render(<PasskeyPanel passkeys={[rows[0] as (typeof rows)[number]]} />);
    click('Remove');
    click('Remove Work laptop');
    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(deletePasskey).toHaveBeenCalledWith({ id: 'p1' });
  });

  it('says so when a passkey cannot be removed, and keeps it', async () => {
    deletePasskey.mockResolvedValue({ data: null, error: { status: 500 } });
    render(<PasskeyPanel passkeys={[rows[0] as (typeof rows)[number]]} />);
    click('Remove');
    click('Remove Work laptop');
    expect((await screen.findByRole('alert')).textContent).toContain('could not be removed');
    expect(reload).not.toHaveBeenCalled();
  });
});

describe('signing in with a passkey, on the sign-in form', () => {
  it('offers it in a browser that has passkeys', async () => {
    render(<SignInForm returnTo="/" />);
    expect(await screen.findByRole('button', { name: 'Sign in with a passkey' })).toBeTruthy();
  });

  it('does not offer it where the browser has none', async () => {
    vi.stubGlobal('PublicKeyCredential', undefined);
    render(<SignInForm returnTo="/" />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy());
    expect(screen.queryByRole('button', { name: /passkey/ })).toBeNull();
  });

  it('goes where the person was headed once the device answers', async () => {
    signInPasskey.mockResolvedValue({ data: { session: {} }, error: null });
    render(<SignInForm returnTo="/settings" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in with a passkey' }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/settings'));
    expect(signInEmail).not.toHaveBeenCalled();
  });

  it('says what to check when the device gives no passkey, and stays put', async () => {
    signInPasskey.mockResolvedValue({ data: null, error: { status: 400, code: 'AUTH_CANCELLED' } });
    render(<SignInForm returnTo="/" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in with a passkey' }));
    expect((await screen.findByRole('alert')).textContent).toContain('this device has a passkey');
    expect(assign).not.toHaveBeenCalled();
  });

  it('says the address must be verified first', async () => {
    signInPasskey.mockResolvedValue({
      data: null,
      error: { status: 403, code: 'EMAIL_NOT_VERIFIED' },
    });
    render(<SignInForm returnTo="/" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in with a passkey' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Verify your email address');
  });

  it('says the account is deactivated', async () => {
    signInPasskey.mockResolvedValue({
      data: null,
      error: { status: 403, code: 'ACCOUNT_DEACTIVATED' },
    });
    render(<SignInForm returnTo="/" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in with a passkey' }));
    expect((await screen.findByRole('alert')).textContent).toContain('has been deactivated');
  });

  it('says to wait when the limit is reached', async () => {
    signInPasskey.mockResolvedValue({ data: null, error: { status: 429 } });
    render(<SignInForm returnTo="/" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in with a passkey' }));
    expect(await screen.findByText(/Too many attempts/)).toBeTruthy();
  });
});
