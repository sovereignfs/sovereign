import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderServer } from './render-server';

const getSession = vi.fn();
// The pages draw the instance's mark, which reads its settings; what it draws is tested with it (instance-identity.test.tsx).
vi.mock('../instance/service', () => ({
  getInstanceIdentity: () =>
    Promise.resolve({ name: 'Acme', logoLight: undefined, logoDark: undefined }),
}));
vi.mock('../auth/session', () => ({ getSession: () => getSession() as unknown }));
vi.mock('../auth/client', () => ({ authClient: { oauth2: { consent: vi.fn() } } }));

const verify = vi.fn();
vi.mock('@better-auth/oauth-provider', () => ({
  verifyOAuthQueryParams: (...args: unknown[]) => verify(...args) as unknown,
  OAUTH_SCOPES: [],
}));
const findOne = vi.fn();
vi.mock('../auth', () => ({
  getAuth: () => Promise.resolve({ $context: Promise.resolve({ adapter: { findOne } }) }),
  getAuthSettings: () => ({ secret: 'a-secret-that-is-long-enough-to-pass-validation' }),
}));

const { default: ConsentPage } = await import('../../app/consent/page');

const signed = {
  client_id: 'abc',
  redirect_uri: 'https://rp.sovereign.local/cb',
  scope: 'openid profile roles',
  state: 's',
  ba_param: ['client_id', 'redirect_uri', 'scope', 'state', 'ba_param'],
  sig: 'signature',
};

beforeEach(() => {
  getSession.mockReset().mockResolvedValue({ user: { id: 'u1', email: 'ada@sovereign.local' } });
  verify.mockReset().mockResolvedValue(true);
  findOne.mockReset().mockResolvedValue({ name: 'Notes', skipConsent: false });
});

describe('the consent page', () => {
  it('sends someone who is not signed in to sign in, and back here, with the request kept', async () => {
    getSession.mockResolvedValue(null);
    await expect(ConsentPage({ searchParams: Promise.resolve(signed) })).rejects.toMatchObject({
      digest: expect.stringContaining('/sign-in?returnTo=%2Fconsent%3Fclient_id%3Dabc'),
    });
  });

  it('asks about the app that is asking, as the person who is signed in, and one level-one heading', async () => {
    const html = await renderServer(await ConsentPage({ searchParams: Promise.resolve(signed) }));
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    expect(html).toContain('Allow access to your account?');
    expect(html).toContain('Notes');
    expect(html).toContain('ada@sovereign.local');
    expect(html).toContain('rp.sovereign.local');
  });

  it('checks the provider’s signature on exactly what was signed, with the instance’s own secret', async () => {
    await ConsentPage({
      searchParams: Promise.resolve({ ...signed, returnTo: '/somewhere-else', extra: 'x' }),
    });
    const [signedQuery, secret] = verify.mock.calls[0] as [string, string];
    expect(secret).toBe('a-secret-that-is-long-enough-to-pass-validation');
    expect(new URLSearchParams(signedQuery).get('returnTo')).toBeNull();
    expect(new URLSearchParams(signedQuery).get('extra')).toBeNull();
    expect(new URLSearchParams(signedQuery).get('client_id')).toBe('abc');
  });

  it('never names an app or lists a permission that came from an address nobody signed', async () => {
    verify.mockResolvedValue(false);
    const html = await renderServer(
      await ConsentPage({ searchParams: Promise.resolve({ ...signed, client_id: 'evil' }) }),
    );
    expect(html).toContain('This request has expired');
    expect(html).not.toContain('Notes');
    expect(findOne).not.toHaveBeenCalled();
  });

  it('says the request has expired for an address with no signature at all', async () => {
    const html = await renderServer(
      await ConsentPage({ searchParams: Promise.resolve({ client_id: 'abc', scope: 'openid' }) }),
    );
    expect(html).toContain('This request has expired');
    expect(verify).not.toHaveBeenCalled();
  });

  it('says it for a client that is gone, and offers a way back', async () => {
    findOne.mockResolvedValue(null);
    const html = await renderServer(await ConsentPage({ searchParams: Promise.resolve(signed) }));
    expect(html).toContain('This request has expired');
    expect(html).toContain('href="/"');
  });

  it('does not offer roles to an untrusted app', async () => {
    const html = await renderServer(await ConsentPage({ searchParams: Promise.resolve(signed) }));
    expect(html).not.toMatch(/role/i);
  });

  it('is drawn with the design system and carries no inline styling or scripts of its own', async () => {
    const html = await renderServer(await ConsentPage({ searchParams: Promise.resolve(signed) }));
    expect(html).not.toMatch(/<script|<style|style="/);
  });
});
