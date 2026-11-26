// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fillUnannounced } from './fill-unannounced';

const addPasskey = vi.fn();
const updatePasskey = vi.fn();
const deletePasskey = vi.fn();
const signInPasskey = vi.fn();
const signInEmail = vi.fn();
vi.mock('../auth/client', () => ({
  authClient: {
    signIn: {
      email: (input: unknown) => signInEmail(input) as unknown,
      passkey: (input: unknown) => signInPasskey(input) as unknown,
    },
    passkey: {
      addPasskey: (input: unknown) => addPasskey(input) as unknown,
      updatePasskey: (input: unknown) => updatePasskey(input) as unknown,
      deletePasskey: (input: unknown) => deletePasskey(input) as unknown,
    },
  },
}));

const PRF = { prf: { eval: { first: new Uint8Array(32).fill(7) } } };
vi.mock('../keys/passkey', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../keys/passkey')>()),
  prfExtension: () => Promise.resolve(PRF),
}));
const session = {
  afterPasskeyAccepted: vi.fn(),
  givePasskeyWayIn: vi.fn(),
  isUnlocked: vi.fn(),
  letPasskeyUnlock: vi.fn(),
  unlockWithPasswordAgain: vi.fn(),
  afterSecondStep: vi.fn(),
  dropHandOver: vi.fn(),
  isKitDue: vi.fn(),
};
vi.mock('../keys/session', () => ({
  ...session,
  afterPasswordAccepted: vi.fn(),
  startAfresh: vi.fn(),
  handOverSecret: vi.fn(),
}));
const derive = vi.fn();
vi.mock('../auth/derive', () => ({
  deriveForSignIn: (password: string, email: string) => {
    derive(password, email);
    return Promise.resolve({ signIn: 'svp1.x', secret: 'secret' });
  },
}));

const { PasskeyPanel } = await import('../../app/security/passkeys/passkey-panel');
const { SignInForm } = await import('../../app/(auth)/sign-in/sign-in-form');
const { TwoFactorForm } = await import('../../app/(auth)/sign-in/two-factor/two-factor-form');

const assign = vi.fn();
const reload = vi.fn();
const rows = [
  {
    id: 'p1',
    credentialId: 'c1',
    name: 'Work laptop',
    createdAt: '2026-10-01T09:00:00.000Z',
    synced: true,
    unlocks: true,
  },
  { id: 'p2', credentialId: 'c2', name: null, createdAt: null, synced: false, unlocks: false },
];

beforeEach(() => {
  for (const mock of [
    addPasskey,
    updatePasskey,
    deletePasskey,
    signInPasskey,
    signInEmail,
    derive,
    ...Object.values(session),
  ]) {
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

  it('says what to do when better-auth refuses the device, as it does one that was not unlocked', async () => {
    addPasskey.mockResolvedValue({
      data: null,
      error: {
        status: 400,
        code: 'FAILED_TO_VERIFY_REGISTRATION',
        message: 'Failed to verify registration',
      },
    });
    render(<PasskeyPanel passkeys={[]} />);
    click('Add a passkey');
    expect((await screen.findByRole('alert')).textContent).toContain(
      'asks for a PIN or biometrics',
    );
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

describe('passkeys that unlock (core-app §5.5)', () => {
  const KEYS = { rpId: 'sovereign.local', email: 'ada@sovereign.local' };
  const out = new Uint8Array(32).fill(9).buffer;

  it('says nothing about unlocking to someone with no keys', () => {
    render(<PasskeyPanel passkeys={rows} />);
    expect(screen.queryByText(/unlock/i)).toBeNull();
  });

  it('marks which passkeys unlock, and offers to let the others', () => {
    render(<PasskeyPanel passkeys={rows} keys={KEYS} />);
    expect(screen.getByText(/Also unlocks your encrypted data/)).toBeTruthy();
    expect(screen.getByText(/Doesn’t unlock your encrypted data/)).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Let it unlock' })).toHaveLength(1);
  });

  it('warns before removing one that unlocks, and not one that does not', () => {
    render(<PasskeyPanel passkeys={rows} keys={KEYS} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0] as HTMLElement);
    expect(screen.getByText(/This passkey also unlocks your encrypted data/)).toBeTruthy();
    cleanup();
    render(<PasskeyPanel passkeys={[rows[1] as (typeof rows)[number]]} keys={KEYS} />);
    click('Remove');
    expect(screen.queryByText(/This passkey also unlocks/)).toBeNull();
  });

  it('adds one asking for the PRF extension, and gives it its way in from the output', async () => {
    addPasskey.mockResolvedValue({
      data: { id: 'new' },
      error: null,
      webauthn: {
        response: { id: 'cnew' },
        clientExtensionResults: { prf: { results: { first: out } } },
      },
    });
    render(<PasskeyPanel passkeys={[]} keys={KEYS} />);
    click('Add a passkey');
    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(addPasskey).toHaveBeenCalledWith({
      name: undefined,
      extensions: PRF,
      returnWebAuthnResponse: true,
    });
    expect(session.givePasskeyWayIn).toHaveBeenCalledWith('cnew', new Uint8Array(out));
    expect(session.letPasskeyUnlock).not.toHaveBeenCalled();
  });

  it('asks a device that gives the output only on use for one more touch, while unlocked', async () => {
    addPasskey.mockResolvedValue({
      data: { id: 'new' },
      error: null,
      webauthn: { response: { id: 'cnew' }, clientExtensionResults: { prf: { enabled: true } } },
    });
    session.isUnlocked.mockResolvedValue(true);
    render(<PasskeyPanel passkeys={[]} keys={KEYS} />);
    click('Add a passkey');
    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(session.letPasskeyUnlock).toHaveBeenCalledWith('sovereign.local', 'cnew');
  });

  it('adds a passkey that cannot unlock as before, with nothing more asked', async () => {
    addPasskey.mockResolvedValue({
      data: { id: 'new' },
      error: null,
      webauthn: { response: { id: 'cnew' }, clientExtensionResults: {} },
    });
    render(<PasskeyPanel passkeys={[]} keys={KEYS} />);
    click('Add a passkey');
    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(session.givePasskeyWayIn).not.toHaveBeenCalled();
    expect(session.letPasskeyUnlock).not.toHaveBeenCalled();
  });

  it('lets one unlock on an unlocked browser', async () => {
    session.isUnlocked.mockResolvedValue(true);
    session.letPasskeyUnlock.mockResolvedValue(true);
    render(<PasskeyPanel passkeys={rows} keys={KEYS} />);
    click('Let it unlock');
    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(session.letPasskeyUnlock).toHaveBeenCalledWith('sovereign.local', 'c2');
  });

  it('asks a locked browser for the password first', async () => {
    session.isUnlocked.mockResolvedValueOnce(false).mockResolvedValue(true);
    session.unlockWithPasswordAgain.mockResolvedValue(true);
    session.letPasskeyUnlock.mockResolvedValue(true);
    render(<PasskeyPanel passkeys={rows} keys={KEYS} />);
    click('Let it unlock');
    fireEvent.change(await screen.findByLabelText(/^Your password/), {
      target: { value: 'correct horse' },
    });
    click('Unlock');
    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(session.unlockWithPasswordAgain).toHaveBeenCalledWith('secret');
    expect(session.letPasskeyUnlock).toHaveBeenCalledWith('sovereign.local', 'c2');
  });

  it('unlocks with what is in the box when it was filled without a word to the page', async () => {
    session.isUnlocked.mockResolvedValueOnce(false).mockResolvedValue(true);
    session.unlockWithPasswordAgain.mockResolvedValue(true);
    session.letPasskeyUnlock.mockResolvedValue(true);
    render(<PasskeyPanel passkeys={rows} keys={KEYS} />);
    click('Let it unlock');
    const box = await screen.findByLabelText(/^Your password/);
    // Empty, it asks for nothing.
    click('Unlock');
    expect(derive).not.toHaveBeenCalled();
    fillUnannounced(box, 'correct horse');
    click('Unlock');
    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(derive).toHaveBeenCalledWith('correct horse', KEYS.email);
  });

  it('says so when the passkey cannot unlock, and that it still signs in', async () => {
    session.isUnlocked.mockResolvedValue(true);
    session.letPasskeyUnlock.mockResolvedValue(false);
    render(<PasskeyPanel passkeys={rows} keys={KEYS} />);
    click('Let it unlock');
    expect((await screen.findByRole('alert')).textContent).toContain('It still signs you in');
    expect(reload).not.toHaveBeenCalled();
  });

  it('unlocks with the same touch at sign-in, from the output better-auth kept from the server', async () => {
    signInPasskey.mockResolvedValue({
      data: { session: {} },
      error: null,
      webauthn: {
        response: { id: 'c1' },
        clientExtensionResults: { prf: { results: { first: out } } },
      },
    });
    render(<SignInForm instanceName="Acme" returnTo="/" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in with a passkey' }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/'));
    expect(signInPasskey).toHaveBeenCalledWith({ extensions: PRF, returnWebAuthnResponse: true });
    expect(session.afterPasskeyAccepted).toHaveBeenCalledWith('c1', new Uint8Array(out));
  });

  it('goes to the recovery kit when the passkey opened the keys and it is still to be kept', async () => {
    signInPasskey.mockResolvedValue({
      data: { session: {} },
      error: null,
      webauthn: {
        response: { id: 'c1' },
        clientExtensionResults: { prf: { results: { first: out } } },
      },
    });
    session.isKitDue.mockResolvedValue(true);
    render(<TwoFactorForm returnTo="/files" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Use a passkey instead' }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/keys/kit?returnTo=%2Ffiles'));
  });

  it('signs in with a passkey that gives no output, and opens nothing', async () => {
    signInPasskey.mockResolvedValue({
      data: { session: {} },
      error: null,
      webauthn: { response: { id: 'c1' }, clientExtensionResults: {} },
    });
    render(<SignInForm instanceName="Acme" returnTo="/" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in with a passkey' }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/'));
    expect(session.afterPasskeyAccepted).not.toHaveBeenCalled();
  });

  it('unlocks with the same touch on the second step too, as on the sign-in page', async () => {
    signInPasskey.mockResolvedValue({
      data: { session: {} },
      error: null,
      webauthn: {
        response: { id: 'c1' },
        clientExtensionResults: { prf: { results: { first: out } } },
      },
    });
    render(<TwoFactorForm returnTo="/files" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Use a passkey instead' }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/files'));
    expect(signInPasskey).toHaveBeenCalledWith({ extensions: PRF, returnWebAuthnResponse: true });
    expect(session.afterPasskeyAccepted).toHaveBeenCalledWith('c1', new Uint8Array(out));
  });

  it('drops the password’s secret on the second step, never opening keys with it after a passkey', async () => {
    signInPasskey.mockResolvedValue({
      data: { session: {} },
      error: null,
      webauthn: { response: { id: 'c2' }, clientExtensionResults: {} },
    });
    render(<TwoFactorForm returnTo="/" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Use a passkey instead' }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/'));
    expect(session.dropHandOver).toHaveBeenCalled();
    expect(session.afterSecondStep).not.toHaveBeenCalled();
    expect(session.afterPasskeyAccepted).not.toHaveBeenCalled();
  });

  it('keeps the second step open when the passkey is refused', async () => {
    signInPasskey.mockResolvedValue({ data: null, error: { status: 401 } });
    render(<TwoFactorForm returnTo="/" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Use a passkey instead' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(session.dropHandOver).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
  });
});

describe('signing in with a passkey, on the sign-in form', () => {
  it('offers it in a browser that has passkeys', async () => {
    render(<SignInForm instanceName="Acme" returnTo="/" />);
    expect(await screen.findByRole('button', { name: 'Sign in with a passkey' })).toBeTruthy();
  });

  it('does not offer it where the browser has none', async () => {
    vi.stubGlobal('PublicKeyCredential', undefined);
    render(<SignInForm instanceName="Acme" returnTo="/" />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy());
    expect(screen.queryByRole('button', { name: /passkey/ })).toBeNull();
  });

  it('goes where the person was headed once the device answers', async () => {
    signInPasskey.mockResolvedValue({ data: { session: {} }, error: null });
    render(<SignInForm instanceName="Acme" returnTo="/settings" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in with a passkey' }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/settings'));
    expect(signInEmail).not.toHaveBeenCalled();
  });

  it('goes back to the app when it was an app that asked for the sign-in', async () => {
    signInPasskey.mockResolvedValue({
      data: { redirect: true, url: 'https://rp.sovereign.local/cb?code=one' },
      error: null,
    });
    render(<SignInForm instanceName="Acme" returnTo="/" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in with a passkey' }));
    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith('https://rp.sovereign.local/cb?code=one'),
    );
  });

  it('says what to check when the device gives no passkey, and stays put', async () => {
    signInPasskey.mockResolvedValue({ data: null, error: { status: 400, code: 'AUTH_CANCELLED' } });
    render(<SignInForm instanceName="Acme" returnTo="/" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in with a passkey' }));
    expect((await screen.findByRole('alert')).textContent).toContain('this device has a passkey');
    expect(assign).not.toHaveBeenCalled();
  });

  it('says the address must be verified first', async () => {
    signInPasskey.mockResolvedValue({
      data: null,
      error: { status: 403, code: 'EMAIL_NOT_VERIFIED' },
    });
    render(<SignInForm instanceName="Acme" returnTo="/" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in with a passkey' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Verify your email address');
  });

  it('says the account is deactivated', async () => {
    signInPasskey.mockResolvedValue({
      data: null,
      error: { status: 403, code: 'ACCOUNT_DEACTIVATED' },
    });
    render(<SignInForm instanceName="Acme" returnTo="/" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in with a passkey' }));
    expect((await screen.findByRole('alert')).textContent).toContain('has been deactivated');
  });

  it('says to wait when the limit is reached', async () => {
    signInPasskey.mockResolvedValue({ data: null, error: { status: 429 } });
    render(<SignInForm instanceName="Acme" returnTo="/" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in with a passkey' }));
    expect(await screen.findByText(/Too many attempts/)).toBeTruthy();
  });
});
