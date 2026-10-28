import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.fn();
const listPasskeys = vi.fn();
vi.mock('../auth/session', () => ({ getSession: () => getSession() as unknown }));
vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('../auth', () => ({
  getAuth: () => Promise.resolve({ api: { listPasskeys: () => listPasskeys() as unknown } }),
}));
vi.mock('../settings', () => ({
  SETTINGS: { instanceName: { key: 'instance.name' } },
  getSettings: () => Promise.resolve({ value: () => Promise.resolve('Our Place') }),
}));
vi.mock('../auth/client', () => ({
  authClient: {
    twoFactor: { enable: vi.fn(), verifyTotp: vi.fn(), verifyBackupCode: vi.fn() },
    passkey: { addPasskey: vi.fn(), updatePasskey: vi.fn(), deletePasskey: vi.fn() },
  },
}));

const { default: SettingsPage } = await import('../../app/security/two-factor/page');
const { default: PasskeysPage } = await import('../../app/security/passkeys/page');
const { default: SecondStepPage } = await import('../../app/(auth)/sign-in/two-factor/page');

const user = (extra: Record<string, unknown> = {}) => ({
  user: { id: 'u1', twoFactorEnabled: false, emailVerified: true, ...extra },
});

beforeEach(() => {
  getSession.mockReset().mockResolvedValue(null);
  listPasskeys.mockReset().mockResolvedValue([]);
});

describe('the two-factor settings page', () => {
  it('sends someone who is not signed in to sign in, and back here afterwards', async () => {
    await expect(SettingsPage()).rejects.toMatchObject({
      digest: expect.stringContaining('/sign-in?returnTo=%2Fsecurity%2Ftwo-factor'),
    });
  });

  it('says it is off, with one heading, for someone who has not turned it on', async () => {
    getSession.mockResolvedValue(user());
    const html = renderToStaticMarkup(await SettingsPage());
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    expect(html).toContain('Two-factor sign-in is off');
    expect(html).toContain('Turn on');
  });

  it('says it is on for someone who has', async () => {
    getSession.mockResolvedValue(user({ twoFactorEnabled: true }));
    const html = renderToStaticMarkup(await SettingsPage());
    expect(html).toContain('Two-factor sign-in is on');
    expect(html).toContain('Get new backup codes');
  });

  it('does not offer to turn it on while the address is not verified', async () => {
    getSession.mockResolvedValue(user({ emailVerified: false }));
    const html = renderToStaticMarkup(await SettingsPage());
    expect(html).toContain('Verify your email address before turning on');
    expect(html).not.toContain('>Turn on<');
  });

  it('is drawn with the design system and carries no inline styling or scripts of its own', async () => {
    getSession.mockResolvedValue(user());
    expect(renderToStaticMarkup(await SettingsPage())).not.toMatch(/<script|<style|style="/);
  });
});

describe('the second sign-in step page', () => {
  const search = (returnTo?: string) => Promise.resolve(returnTo === undefined ? {} : { returnTo });

  it('asks for a code, with one heading', async () => {
    const html = renderToStaticMarkup(await SecondStepPage({ searchParams: search() }));
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    expect(html).toContain('Confirm it is you');
    expect(html).toMatch(/<input[^>]*autoComplete="one-time-code"/);
    expect(html).toContain('Use a backup code instead');
  });

  it('sends someone who is already signed in on to where they were going', async () => {
    getSession.mockResolvedValue(user());
    await expect(SecondStepPage({ searchParams: search('/settings') })).rejects.toMatchObject({
      digest: expect.stringContaining('/settings'),
    });
  });

  it('never sends someone signed in to another site', async () => {
    getSession.mockResolvedValue(user());
    await expect(SecondStepPage({ searchParams: search('//evil.example') })).rejects.toMatchObject({
      digest: expect.not.stringContaining('evil.example'),
    });
  });
});

describe('the passkeys page', () => {
  it('sends someone who is not signed in to sign in, and back here afterwards', async () => {
    await expect(PasskeysPage()).rejects.toMatchObject({
      digest: expect.stringContaining('/sign-in?returnTo=%2Fsecurity%2Fpasskeys'),
    });
    expect(listPasskeys).not.toHaveBeenCalled();
  });

  it('says there are none, with one heading, and that the password keeps working', async () => {
    getSession.mockResolvedValue(user());
    const html = renderToStaticMarkup(await PasskeysPage());
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    expect(html).toContain('You have no passkeys');
    expect(html).toContain('Your password keeps working');
  });

  it('lists what the server holds, with dates as text and nothing it should not show', async () => {
    getSession.mockResolvedValue(user());
    listPasskeys.mockResolvedValue([
      {
        id: 'p1',
        name: 'Work laptop',
        createdAt: new Date('2026-10-01T09:00:00Z'),
        backedUp: true,
        publicKey: 'SECRET-PUBLIC-KEY',
        credentialID: 'CREDENTIAL-ID',
      },
    ]);
    const html = renderToStaticMarkup(await PasskeysPage());
    expect(html).toContain('Work laptop');
    expect(html).not.toContain('SECRET-PUBLIC-KEY');
    expect(html).not.toContain('CREDENTIAL-ID');
  });

  it('is drawn with the design system and carries no inline styling or scripts of its own', async () => {
    getSession.mockResolvedValue(user());
    expect(renderToStaticMarkup(await PasskeysPage())).not.toMatch(/<script|<style|style="/);
  });
});
