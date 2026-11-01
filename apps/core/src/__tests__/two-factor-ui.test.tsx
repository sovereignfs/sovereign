// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const enable = vi.fn();
const disable = vi.fn();
const generateBackupCodes = vi.fn();
const verifyTotp = vi.fn();
const verifyBackupCode = vi.fn();
vi.mock('../auth/client', () => ({
  authClient: {
    twoFactor: {
      enable: (input: unknown) => enable(input) as unknown,
      disable: (input: unknown) => disable(input) as unknown,
      generateBackupCodes: (input: unknown) => generateBackupCodes(input) as unknown,
      verifyTotp: (input: unknown) => verifyTotp(input) as unknown,
      verifyBackupCode: (input: unknown) => verifyBackupCode(input) as unknown,
    },
  },
}));

const { TwoFactorPanel } = await import('../../app/security/two-factor/two-factor-panel');
const { TwoFactorForm } = await import('../../app/(auth)/sign-in/two-factor/two-factor-form');

const assign = vi.fn();
const reload = vi.fn();
const URI =
  'otpauth://totp/Sovereign:ada%40sovereign.local?secret=GEZDGNBVGY3TQOJQ&issuer=Sovereign';
const CODES = ['aaaaa-11111', 'bbbbb-22222', 'ccccc-33333'];

beforeEach(() => {
  for (const mock of [enable, disable, generateBackupCodes, verifyTotp, verifyBackupCode]) {
    mock.mockReset();
  }
  assign.mockReset();
  reload.mockReset();
  vi.stubGlobal('location', { ...window.location, assign, reload });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(new RegExp(`^${label}`)), { target: { value } });
/** The six boxes, one digit in each, as someone typing or an authenticator's autofill would fill them. */
const typeCode = (code: string) => {
  for (const [at, digit] of [...code].entries()) {
    fireEvent.change(screen.getByLabelText(`Digit ${at + 1}`), { target: { value: digit } });
  }
};
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));

describe('the two-factor panel, while it is off', () => {
  it('says it is off and offers to turn it on', () => {
    render(<TwoFactorPanel enabled={false} issuer="Sovereign" verified />);
    expect(screen.getByText('Two-factor sign-in is off')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Turn on' })).toBeTruthy();
  });

  it('asks for the address to be verified first, and offers nothing it would be refused', () => {
    render(<TwoFactorPanel enabled={false} issuer="Sovereign" verified={false} />);
    expect(screen.getByText(/Verify your email address before turning on/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Turn on' })).toBeNull();
  });

  it('asks for the password, sends it with the instance name, and shows the key', async () => {
    enable.mockResolvedValue({
      data: { method: 'totp', totpURI: URI, backupCodes: CODES },
      error: null,
    });
    render(<TwoFactorPanel enabled={false} issuer="Our Place" verified />);
    click('Turn on');
    type('Password', 'correct horse battery');
    click('Continue');
    expect(await screen.findByText('Set up your authenticator app')).toBeTruthy();
    expect(enable).toHaveBeenCalledWith({ password: 'correct horse battery', issuer: 'Our Place' });
    expect(screen.getByRole('img', { name: /QR code/ })).toBeTruthy();
    expect(screen.getByText('GEZD GNBV GY3T QOJQ')).toBeTruthy();
  });

  it('keeps the backup codes back until a valid code has turned it on', async () => {
    enable.mockResolvedValue({
      data: { method: 'totp', totpURI: URI, backupCodes: CODES },
      error: null,
    });
    verifyTotp.mockResolvedValue({ data: {}, error: null });
    render(<TwoFactorPanel enabled={false} issuer="Sovereign" verified />);
    click('Turn on');
    type('Password', 'correct horse battery');
    click('Continue');
    await screen.findByText('Set up your authenticator app');
    for (const code of CODES) expect(screen.queryByText(code)).toBeNull();

    type('Code from the app', ' 123456 ');
    click('Turn on');
    expect(await screen.findByText('Your backup codes')).toBeTruthy();
    expect(verifyTotp).toHaveBeenCalledWith({ code: '123456' });
    for (const code of CODES) expect(screen.getByText(code)).toBeTruthy();
    expect(screen.getByText(/They are not shown again/)).toBeTruthy();

    click('I have saved them');
    expect(reload).toHaveBeenCalled();
  });

  it('says when the code is not right, and keeps the codes back', async () => {
    enable.mockResolvedValue({
      data: { method: 'totp', totpURI: URI, backupCodes: CODES },
      error: null,
    });
    verifyTotp.mockResolvedValue({ data: null, error: { status: 401, code: 'INVALID_CODE' } });
    render(<TwoFactorPanel enabled={false} issuer="Sovereign" verified />);
    click('Turn on');
    type('Password', 'correct horse battery');
    click('Continue');
    await screen.findByText('Set up your authenticator app');
    type('Code from the app', '000000');
    click('Turn on');
    expect((await screen.findByRole('alert')).textContent).toContain('That code is not right');
    for (const code of CODES) expect(screen.queryByText(code)).toBeNull();
  });

  it('says when the password is not right, and stays on the password step', async () => {
    enable.mockResolvedValue({
      data: null,
      error: { status: 400, code: 'INVALID_PASSWORD' },
    });
    render(<TwoFactorPanel enabled={false} issuer="Sovereign" verified />);
    click('Turn on');
    type('Password', 'wrong');
    click('Continue');
    expect((await screen.findByRole('alert')).textContent).toContain('password is not right');
    expect((screen.getByLabelText(/^Password/) as HTMLInputElement).value).toBe('wrong');
  });

  it('can be cancelled before anything is sent', () => {
    render(<TwoFactorPanel enabled={false} issuer="Sovereign" verified />);
    click('Turn on');
    click('Cancel');
    expect(screen.getByText('Two-factor sign-in is off')).toBeTruthy();
    expect(enable).not.toHaveBeenCalled();
  });
});

describe('the two-factor panel, while it is on', () => {
  it('says it is on, with ways to get new backup codes or turn it off', () => {
    render(<TwoFactorPanel enabled issuer="Sovereign" verified />);
    expect(screen.getByText('Two-factor sign-in is on')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Get new backup codes' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Turn off' })).toBeTruthy();
  });

  it('shows new backup codes after the password is given, and says the old ones stop working', async () => {
    generateBackupCodes.mockResolvedValue({ data: { backupCodes: CODES }, error: null });
    render(<TwoFactorPanel enabled issuer="Sovereign" verified />);
    click('Get new backup codes');
    expect(screen.getByText(/old backup codes will stop working/)).toBeTruthy();
    type('Password', 'correct horse battery');
    click('Get new codes');
    expect(await screen.findByText('Your new backup codes')).toBeTruthy();
    expect(generateBackupCodes).toHaveBeenCalledWith({ password: 'correct horse battery' });
    for (const code of CODES) expect(screen.getByText(code)).toBeTruthy();
  });

  it('turns off after the password is given, and reloads to show what the server holds', async () => {
    disable.mockResolvedValue({ data: { status: true }, error: null });
    render(<TwoFactorPanel enabled issuer="Sovereign" verified />);
    click('Turn off');
    type('Password', 'correct horse battery');
    fireEvent.click(screen.getAllByRole('button', { name: 'Turn off' })[0] as HTMLElement);
    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(disable).toHaveBeenCalledWith({ password: 'correct horse battery' });
  });

  it('does not reload, and says why, when the password is wrong', async () => {
    disable.mockResolvedValue({ data: null, error: { status: 400, code: 'INVALID_PASSWORD' } });
    render(<TwoFactorPanel enabled issuer="Sovereign" verified />);
    click('Turn off');
    type('Password', 'wrong');
    fireEvent.click(screen.getAllByRole('button', { name: 'Turn off' })[0] as HTMLElement);
    expect((await screen.findByRole('alert')).textContent).toContain('password is not right');
    expect(reload).not.toHaveBeenCalled();
  });

  it('says to wait when the limit is reached', async () => {
    generateBackupCodes.mockResolvedValue({ data: null, error: { status: 429 } });
    render(<TwoFactorPanel enabled issuer="Sovereign" verified />);
    click('Get new backup codes');
    type('Password', 'x');
    click('Get new codes');
    expect(await screen.findByText(/Too many attempts/)).toBeTruthy();
  });
});

describe('the second sign-in step', () => {
  it('sends the code and goes where the person was headed', async () => {
    verifyTotp.mockResolvedValue({ data: {}, error: null });
    render(<TwoFactorForm returnTo="/settings" />);
    typeCode('123456');
    click('Verify');
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/settings'));
    expect(verifyTotp).toHaveBeenCalledWith({ code: '123456' });
    expect(verifyBackupCode).not.toHaveBeenCalled();
  });

  it('goes back to the app, with its code, when an app asked for the sign-in', async () => {
    verifyTotp.mockResolvedValue({
      data: { redirect: true, url: 'https://rp.sovereign.local/cb?code=one' },
      error: null,
    });
    render(<TwoFactorForm returnTo="/" />);
    typeCode('123456');
    click('Verify');
    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith('https://rp.sovereign.local/cb?code=one'),
    );
    expect(assign).not.toHaveBeenCalledWith('/');
  });

  it('keeps the app’s request on the way back to sign in, so the app’s sign-in is not lost', async () => {
    const request = '?client_id=abc&sig=signed';
    vi.stubGlobal('location', { ...window.location, assign, reload, search: request });
    render(<TwoFactorForm returnTo="/" />);
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Back to sign in' }).getAttribute('href')).toBe(
        `/sign-in${request}`,
      ),
    );
  });

  it('goes back to plain sign-in on an ordinary visit', () => {
    render(<TwoFactorForm returnTo="/" />);
    expect(screen.getByRole('link', { name: 'Back to sign in' }).getAttribute('href')).toBe(
      '/sign-in?returnTo=%2F',
    );
  });

  it('takes the code a digit at a time, and as a whole when it is pasted', () => {
    render(<TwoFactorForm returnTo="/" />);
    fireEvent.paste(screen.getByLabelText('Digit 1'), {
      clipboardData: { getData: () => '12 34-56' },
    });
    for (const [at, digit] of [...'123456'].entries()) {
      expect((screen.getByLabelText(`Digit ${at + 1}`) as HTMLInputElement).value).toBe(digit);
    }
  });

  it('takes a backup code instead, when the person asks to', async () => {
    verifyBackupCode.mockResolvedValue({ data: {}, error: null });
    render(<TwoFactorForm returnTo="/" />);
    click('Use a backup code');
    type('Backup code', 'aaaaa-11111');
    click('Verify');
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/'));
    expect(verifyBackupCode).toHaveBeenCalledWith({ code: 'aaaaa-11111' });
    expect(verifyTotp).not.toHaveBeenCalled();
  });

  it('goes back to the app code, with nothing typed carried over', () => {
    render(<TwoFactorForm returnTo="/" />);
    click('Use a backup code');
    type('Backup code', 'aaaaa-11111');
    click('Use the authenticator app instead');
    for (let digit = 1; digit <= 6; digit++) {
      expect((screen.getByLabelText(`Digit ${digit}`) as HTMLInputElement).value).toBe('');
    }
  });

  it.each([
    [false, 'That code is not right'],
    [true, 'That backup code is not right, or it was already used'],
  ])('says a wrong code is wrong (backup: %s), and keeps the form', async (backup, words) => {
    (backup ? verifyBackupCode : verifyTotp).mockResolvedValue({
      data: null,
      error: { status: 401, code: 'INVALID_CODE' },
    });
    render(<TwoFactorForm returnTo="/" />);
    if (backup) click('Use a backup code');
    if (backup) type('Backup code', 'nope');
    else typeCode('123456');
    click('Verify');
    expect((await screen.findByRole('alert')).textContent).toContain(words);
    expect(assign).not.toHaveBeenCalled();
  });

  it.each(['INVALID_TWO_FACTOR_COOKIE', 'TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE'])(
    'says the sign-in is over, and links to start again, on %s',
    async (code) => {
      verifyTotp.mockResolvedValue({ data: null, error: { status: 401, code } });
      render(<TwoFactorForm returnTo="/settings" />);
      typeCode('123456');
      click('Verify');
      expect(await screen.findByText(/can no longer be finished/)).toBeTruthy();
      expect(screen.getByRole('link', { name: 'Sign in again' }).getAttribute('href')).toBe(
        '/sign-in?returnTo=%2Fsettings',
      );
      expect(screen.queryByLabelText('Digit 1')).toBeNull();
    },
  );

  it('says to wait, without ending the sign-in, when the account is locked for a while', async () => {
    verifyTotp.mockResolvedValue({
      data: null,
      error: { status: 429, code: 'ACCOUNT_TEMPORARILY_LOCKED' },
    });
    render(<TwoFactorForm returnTo="/" />);
    typeCode('123456');
    click('Verify');
    expect(await screen.findByText(/Wait a few minutes/)).toBeTruthy();
  });
});
