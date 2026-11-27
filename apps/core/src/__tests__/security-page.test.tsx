import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.fn();
const listPasskeys = vi.fn();
const listSessions = vi.fn();
vi.mock('../auth/session', () => ({
  getSession: () => getSession() as unknown,
  currentLock: () => Promise.resolve({ lock: undefined, locked: false }),
}));
vi.mock('next/navigation', async (actual) => ({
  ...(await actual<typeof import('next/navigation')>()),
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock('../../app/security/lock-actions', () => ({ saveLock: vi.fn(), removeLock: vi.fn() }));
vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('../auth', () => ({
  getAuth: () => Promise.resolve({ api: { listPasskeys: () => listPasskeys() as unknown } }),
}));
vi.mock('../database', () => ({ getDatabase: () => Promise.resolve({}) }));
const vault = vi.fn();
vi.mock('../keys/vault', () => ({
  KeyVault: class {
    read() {
      return vault() as unknown;
    }
  },
}));
const escrowLine = vi.fn();
vi.mock('../settings', () => ({
  SETTINGS: { escrowPublicKey: { key: 'escrow.public_key' } },
  getSettings: () => Promise.resolve({ value: () => escrowLine() as unknown }),
}));
vi.mock('../auth/settings', () => ({
  getAuthSettings: () => ({
    passwordPolicy: {
      minLength: 8,
      maxLength: 128,
      requireUppercase: false,
      requireLowercase: false,
      requireNumber: false,
      requireSymbol: false,
    },
    webauthn: { rpId: 'localhost' },
  }),
}));
vi.mock('../sessions/sessions', () => ({
  listSessions: (...args: unknown[]) => listSessions(...args) as unknown,
}));
vi.mock('../auth/client', () => ({ authClient: { changePassword: vi.fn() } }));
vi.mock('../../app/security/actions', () => ({
  endSessionAction: vi.fn(),
  endOtherSessionsAction: vi.fn(),
}));

const { default: SecurityPage } = await import('../../app/security/page');

const user = (extra: Record<string, unknown> = {}) => ({
  user: { id: 'u1', twoFactorEnabled: false, ...extra },
  session: { id: 's1' },
});

beforeEach(() => {
  vault.mockReset().mockResolvedValue({ waysIn: [] });
  escrowLine.mockReset().mockResolvedValue(undefined);
  getSession.mockReset().mockResolvedValue(null);
  listPasskeys.mockReset().mockResolvedValue([]);
  listSessions.mockReset().mockResolvedValue([
    {
      id: 's1',
      current: true,
      device: 'Chrome on macOS',
      ipAddress: null,
      signedInAt: 1,
      lastActiveAt: 1,
    },
  ]);
});

describe('the security page', () => {
  it('sends someone who is not signed in to sign in, and back here afterwards', async () => {
    await expect(SecurityPage()).rejects.toMatchObject({
      digest: expect.stringContaining('/sign-in?returnTo=%2Fsecurity'),
    });
    expect(listSessions).not.toHaveBeenCalled();
  });

  it('has a heading and a section for the password, two-factor sign-in, passkeys and sessions', async () => {
    getSession.mockResolvedValue(user());
    const html = renderToStaticMarkup(await SecurityPage());
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    for (const heading of [
      'Password',
      'Two-factor sign-in',
      'Passkeys',
      'Where you are signed in',
    ]) {
      expect(html).toContain(heading);
    }
    expect(html).toContain('Chrome on macOS (this device)');
  });

  it('asks for the sessions of the person it checked, with the one in use', async () => {
    getSession.mockResolvedValue(user());
    await SecurityPage();
    expect(listSessions).toHaveBeenCalledWith(expect.anything(), 'u1', 's1');
  });

  it('says where two-factor sign-in and passkeys stand, with a link to each', async () => {
    getSession.mockResolvedValue(user({ twoFactorEnabled: true }));
    listPasskeys.mockResolvedValue([{}, {}]);
    const html = renderToStaticMarkup(await SecurityPage());
    expect(html).toContain('On. Signing in asks for a code');
    expect(html).toContain('Manage two-factor sign-in');
    expect(html).toContain('You have 2 passkeys.');
    expect(html).toContain('href="/security/passkeys"');
    expect(html).toContain('href="/security/two-factor"');
  });

  it('offers to set up what is off, and says there are no passkeys', async () => {
    getSession.mockResolvedValue(user());
    const html = renderToStaticMarkup(await SecurityPage());
    expect(html).toContain('Set up two-factor sign-in');
    expect(html).toContain('You have no passkeys.');
  });

  it('is drawn with the design system and carries no inline styling of its own', async () => {
    getSession.mockResolvedValue(user());
    expect(renderToStaticMarkup(await SecurityPage())).not.toMatch(/<style|style="/);
  });

  it('says who can open the person’s encrypted data, only to someone who has some', async () => {
    getSession.mockResolvedValue(user());
    expect(renderToStaticMarkup(await SecurityPage())).not.toContain('Encrypted data');
    vault.mockResolvedValue({ account: { kitConfirmed: false }, waysIn: [] });
    const pending = renderToStaticMarkup(await SecurityPage());
    expect(pending).toContain('href="/keys/kit?returnTo=%2Fsecurity"');
    vault.mockResolvedValue({ account: { kitConfirmed: true }, waysIn: [] });
    const kept = renderToStaticMarkup(await SecurityPage());
    expect(kept).toContain('kept your recovery kit');
    expect(kept).not.toContain('href="/keys/kit');
    expect(renderToStaticMarkup(await SecurityPage())).toContain('Recovery is off');
    escrowLine.mockResolvedValue(`sv-escrow-1.${'A'.repeat(11)}.${'B'.repeat(43)}`);
    expect(renderToStaticMarkup(await SecurityPage())).toContain('the next time you open an app');
    vault.mockResolvedValue({
      account: { kitConfirmed: true },
      waysIn: [{ way: 'escrow', id: 'A'.repeat(11), record: '{}' }],
    });
    expect(renderToStaticMarkup(await SecurityPage())).toContain('can recover your encrypted data');
  });
});
