import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ROLE_ADMIN, ROLE_OWNER, ROLE_USER } from '../auth/roles';
import type { ShownInstance } from '../instance/describe';
import { DEFAULT_MATRIX } from '../roles/capabilities';

const getSession = vi.fn();
vi.mock('../auth/session', () => ({ getSession: () => getSession() as unknown }));
const matrixInForce = vi.fn();
vi.mock('../roles/matrix', () => ({ getCapabilityMatrix: () => matrixInForce() as unknown }));
vi.mock('../database', () => ({ getDatabase: () => Promise.resolve({}) }));
vi.mock('../settings', () => ({ getSettings: () => Promise.resolve({}) }));
const describeInstance = vi.fn();
vi.mock('../instance/describe', () => ({
  describeInstance: (...args: unknown[]) => describeInstance(...args) as unknown,
}));
const mailStatus = vi.fn();
vi.mock('../mail', () => ({
  getMailService: () => Promise.resolve({ status: () => mailStatus() as unknown }),
}));
const cipher = vi.fn();
vi.mock('../config', () => ({ getFieldCipher: () => cipher() as unknown }));
vi.mock('../../app/console/settings/actions', () => ({
  saveNameAction: vi.fn(),
  resetNameAction: vi.fn(),
  saveInviteOnlyAction: vi.fn(),
  resetInviteOnlyAction: vi.fn(),
  saveSmtpAction: vi.fn(),
  resetSmtpAction: vi.fn(),
}));

const { default: SettingsPage } = await import('../../app/console/settings/page');

const shown = (overrides: Partial<ShownInstance> = {}): ShownInstance => ({
  name: { value: 'Acme Co', source: 'saved' },
  inviteOnly: { value: true, source: 'default' },
  images: {
    'logo-light': undefined,
    'logo-dark': undefined,
    favicon: undefined,
    'app-icon': undefined,
    'app-icon-maskable': undefined,
  },
  smtp: undefined,
  ...overrides,
});
const SMTP: NonNullable<ShownInstance['smtp']> = {
  host: { value: 'mail.example.com', source: 'saved' },
  port: { value: undefined, source: 'unset' },
  user: { value: 'mailer', source: 'saved' },
  from: { value: 'noreply@example.com', source: 'environment' },
  password: { source: 'saved', hasValue: true, unreadable: false },
};
const as = (role: unknown) => getSession.mockResolvedValue({ user: { id: 'x', role } });
const failure = async (run: () => Promise<unknown>) => {
  try {
    await run();
  } catch (error) {
    return error as { digest?: string };
  }
  return undefined;
};

beforeEach(() => {
  getSession.mockReset().mockResolvedValue(null);
  matrixInForce.mockReset().mockResolvedValue(DEFAULT_MATRIX);
  describeInstance
    .mockReset()
    .mockImplementation((_s, _b, options: { withMail: boolean }) =>
      Promise.resolve(shown({ smtp: options.withMail ? SMTP : undefined })),
    );
  mailStatus.mockReset().mockResolvedValue({ state: 'configured' });
  cipher.mockReset().mockReturnValue({});
});

describe('the settings page', () => {
  it('is for those who may view the instance, and a page that is not there for anyone else', async () => {
    as(ROLE_USER);
    expect((await failure(() => SettingsPage()))?.digest).toBe('NEXT_HTTP_ERROR_FALLBACK;404');
    getSession.mockResolvedValue(null);
    expect((await failure(() => SettingsPage()))?.digest).toContain('/sign-in');
    expect(describeInstance).not.toHaveBeenCalled();
  });

  it('has one heading and a section each for the name, pictures, sign-up and email', async () => {
    as(ROLE_ADMIN);
    const html = renderToStaticMarkup(await SettingsPage());
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    for (const heading of ['Name', 'Logo and favicon', 'Sign-up', 'Email']) {
      expect(html).toContain(`>${heading}</h2>`);
    }
    expect(html).toMatch(/<input[^>]*name="name"[^>]*value="Acme Co"/);
    expect(html).toContain('Logo for light pages');
    expect(html).toContain('Favicon');
  });

  it('shows the mail settings to the owner only, and never loads them for anyone else', async () => {
    as(ROLE_ADMIN);
    const forAdmin = renderToStaticMarkup(await SettingsPage());
    expect(describeInstance).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), {
      withMail: false,
    });
    expect(forAdmin).not.toContain('mail.example.com');
    expect(forAdmin).not.toContain('name="host"');
    expect(forAdmin).toContain('Only the owner can see or change how email is sent.');

    as(ROLE_OWNER);
    const forOwner = renderToStaticMarkup(await SettingsPage());
    expect(describeInstance).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), {
      withMail: true,
    });
    expect(forOwner).toContain('mail.example.com');
    expect(forOwner).toMatch(/<input[^>]*name="host"/);
  });

  it('never puts the saved password in the page', async () => {
    as(ROLE_OWNER);
    const html = renderToStaticMarkup(await SettingsPage());
    expect(html).toMatch(/<input[^>]*type="password"[^>]*name="password"/);
    expect(html).not.toMatch(/<input[^>]*name="password"[^>]*value="[^"]/);
    expect(html).toContain('A password is saved. Leave this empty to keep it.');
  });

  it('lets someone who may only look, look: no buttons, and it says so', async () => {
    as(ROLE_ADMIN);
    matrixInForce.mockResolvedValue({
      [ROLE_ADMIN]: new Set(['profile:manage', 'console:access', 'instance:view']),
      [ROLE_USER]: new Set(['profile:manage']),
    });
    const html = renderToStaticMarkup(await SettingsPage());
    expect(html).toContain('You can look at these settings, but not change them.');
    expect(html).not.toContain('Save name');
    expect(html).not.toContain('Upload');
    expect(html).toMatch(/<input[^>]*disabled=""[^>]*name="name"/);
  });

  it('says when email is not set up, and when it is', async () => {
    as(ROLE_ADMIN);
    expect(renderToStaticMarkup(await SettingsPage())).toContain('Email is set up.');
    mailStatus.mockResolvedValue({
      state: 'not-configured',
      reasons: ['no SMTP server is set'],
    });
    expect(renderToStaticMarkup(await SettingsPage())).toContain(
      'Email is not set up, so nothing that needs it can be sent: no SMTP server is set.',
    );
  });

  it('warns the owner that a password cannot be kept without the encryption keys', async () => {
    as(ROLE_OWNER);
    cipher.mockReturnValue(undefined);
    expect(renderToStaticMarkup(await SettingsPage())).toContain('SV_FIELD_ENCRYPTION_KEYS');
    cipher.mockReturnValue({});
    expect(renderToStaticMarkup(await SettingsPage())).not.toContain('SV_FIELD_ENCRYPTION_KEYS');
  });

  it('shows a picture that is set, where it is served from', async () => {
    as(ROLE_ADMIN);
    describeInstance.mockResolvedValue(
      shown({
        images: {
          'logo-light': {
            contentType: 'image/png',
            version: 'abcd',
            size: 10,
            path: '/api/branding/logo-light?v=abcd',
          },
          'logo-dark': undefined,
          favicon: undefined,
          'app-icon': undefined,
          'app-icon-maskable': undefined,
        },
      }),
    );
    const html = renderToStaticMarkup(await SettingsPage());
    expect(html).toContain('src="/api/branding/logo-light?v=abcd"');
    expect(html).toContain('Remove');
  });
});
