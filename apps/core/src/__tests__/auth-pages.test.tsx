import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.fn();
vi.mock('../auth/session', () => ({ getSession: () => getSession() as unknown }));
vi.mock('../auth/client', () => ({
  authClient: {
    signIn: { email: vi.fn() },
    signUp: { email: vi.fn() },
    signOut: vi.fn(),
    sendVerificationEmail: vi.fn(),
    requestPasswordReset: vi.fn(),
    resetPassword: vi.fn(),
  },
}));

const getRegistrationMode = vi.fn();
vi.mock('../auth/mode', () => ({ getRegistrationMode: () => getRegistrationMode() as unknown }));

async function pages(env: Record<string, string> = {}) {
  vi.resetModules();
  vi.stubEnv('SV_URL', 'http://localhost:3000');
  vi.stubEnv('SV_AUTH_SECRET', 'a-secret-that-is-long-enough-to-pass-validation');
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
  const signIn = (await import('../../app/(auth)/sign-in/page')).default;
  const signUp = (await import('../../app/(auth)/sign-up/page')).default;
  const forgot = (await import('../../app/(auth)/forgot-password/page')).default;
  const reset = await import('../../app/(auth)/reset-password/page');
  return { signIn, signUp, forgot, reset: reset.default, resetMetadata: reset.metadata };
}

const search = (returnTo?: string, extra: Record<string, string> = {}) =>
  Promise.resolve({ ...(returnTo === undefined ? {} : { returnTo }), ...extra });

beforeEach(() => {
  getSession.mockReset().mockResolvedValue(null);
  getRegistrationMode.mockReset().mockResolvedValue('open');
});
afterEach(() => vi.unstubAllEnvs());

describe('the sign-in page', () => {
  it('has one heading, an email field and a password field, and a way to sign up', async () => {
    const { signIn } = await pages();
    const html = renderToStaticMarkup(await signIn({ searchParams: search() }));
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    expect(html).toContain('Sign in');
    expect(html).toMatch(/<input[^>]*type="email"/);
    expect(html).toMatch(/<input[^>]*type="password"/);
    expect(html).toContain('href="/sign-up?returnTo=%2F"');
  });

  it('carries the page the person was after through to the sign-up link', async () => {
    const { signIn } = await pages();
    const html = renderToStaticMarkup(await signIn({ searchParams: search('/settings?tab=mail') }));
    expect(html).toContain('href="/sign-up?returnTo=%2Fsettings%3Ftab%3Dmail"');
  });

  it('does not carry an address on another site', async () => {
    const { signIn } = await pages();
    const html = renderToStaticMarkup(
      await signIn({ searchParams: search('https://evil.example') }),
    );
    expect(html).not.toContain('evil.example');
  });

  it('sends someone who is already signed in to where they were going', async () => {
    const { signIn } = await pages();
    getSession.mockResolvedValue({ user: { id: 'u1' } });
    await expect(signIn({ searchParams: search('/settings') })).rejects.toMatchObject({
      digest: expect.stringContaining('/settings'),
    });
  });

  it('never sends someone signed in to another site', async () => {
    const { signIn } = await pages();
    getSession.mockResolvedValue({ user: { id: 'u1' } });
    await expect(signIn({ searchParams: search('//evil.example') })).rejects.toMatchObject({
      digest: expect.not.stringContaining('evil.example'),
    });
  });

  it('is drawn with the design system and carries no inline styling or scripts of its own', async () => {
    const { signIn } = await pages();
    expect(renderToStaticMarkup(await signIn({ searchParams: search() }))).not.toMatch(
      /<script|<style|style="/,
    );
  });
});

describe('the legal links', () => {
  // The sign-up form carries its own, beside the box to tick.
  it.each(['signIn', 'signUp'] as const)('are on the %s page', async (page) => {
    const pagesNow = await pages();
    const html = renderToStaticMarkup(await pagesNow[page]({ searchParams: search() }));
    expect(html).toContain('href="/privacy"');
    expect(html).toContain('href="/tos"');
  });

  it('are not repeated on the sign-up page', async () => {
    const { signUp } = await pages();
    const html = renderToStaticMarkup(await signUp({ searchParams: search() }));
    expect(html.match(/href="\/privacy"/g)).toHaveLength(1);
  });
});

describe('the sign-up page', () => {
  it('asks for a name, an email and a password', async () => {
    const { signUp } = await pages();
    const html = renderToStaticMarkup(await signUp({ searchParams: search() }));
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    expect(html).toContain('Create an account');
    expect(html).toMatch(/<input[^>]*name="name"/);
    expect(html).toMatch(/<input[^>]*type="email"/);
    expect(html).toMatch(/<input[^>]*type="password"/);
    expect(html).toContain('href="/sign-in?returnTo=%2F"');
  });

  it('asks for the terms to be accepted, beside links to read them', async () => {
    const { signUp } = await pages();
    const html = renderToStaticMarkup(await signUp({ searchParams: search() }));
    expect(html).toMatch(/<input[^>]*type="checkbox"/);
    expect(html).toContain('I agree to the Terms of Service and the Privacy Policy');
    expect(html).toContain('target="_blank"');
  });

  it('tells the person the password rules the server will apply', async () => {
    const { signUp } = await pages({
      SV_AUTH_PASSWORD_MIN_LENGTH: '12',
      SV_AUTH_PASSWORD_REQUIRE_NUMBER: 'true',
    });
    const html = renderToStaticMarkup(await signUp({ searchParams: search() }));
    expect(html).toContain('At least 12 characters, with a number.');
  });

  it('says nothing about invitations when anyone can sign up', async () => {
    const { signUp } = await pages();
    const html = renderToStaticMarkup(await signUp({ searchParams: search() }));
    expect(html).not.toMatch(/invitation|owner/i);
  });

  it('says sign-up is by invitation when it is, and for which address', async () => {
    getRegistrationMode.mockResolvedValue('invite-only');
    const { signUp } = await pages();
    const html = renderToStaticMarkup(await signUp({ searchParams: search() }));
    expect(html).toContain('Sign-up here is by invitation');
    expect(html).toContain('the email address your invitation was sent to');
  });

  it('tells the first visitor that the account they make is the owner', async () => {
    getRegistrationMode.mockResolvedValue('first-account');
    const { signUp } = await pages();
    const html = renderToStaticMarkup(await signUp({ searchParams: search() }));
    expect(html).toContain('no accounts yet');
    expect(html).toContain('is its owner');
    expect(html).not.toContain('by invitation');
  });

  it('sends someone who is already signed in away', async () => {
    const { signUp } = await pages();
    getSession.mockResolvedValue({ user: { id: 'u1' } });
    await expect(signUp({ searchParams: search() })).rejects.toMatchObject({
      digest: expect.stringContaining('NEXT_REDIRECT'),
    });
  });
});

describe('the sign-in page, when an email link sends the person back', () => {
  it('tells someone who has just reset their password to sign in', async () => {
    const { signIn } = await pages();
    const html = renderToStaticMarkup(
      await signIn({ searchParams: search(undefined, { reset: '1' }) }),
    );
    expect(html).toContain('Your password is changed');
  });

  it('explains a verification link that did not work', async () => {
    const { signIn } = await pages();
    const html = renderToStaticMarkup(
      await signIn({ searchParams: search(undefined, { error: 'TOKEN_EXPIRED' }) }),
    );
    expect(html).toContain('expired or was already used');
  });

  it('says nothing of the sort on an ordinary visit, and offers a way to reset a password', async () => {
    const { signIn } = await pages();
    const html = renderToStaticMarkup(await signIn({ searchParams: search() }));
    expect(html).not.toContain('expired');
    expect(html).not.toContain('password is changed');
    expect(html).toContain('href="/forgot-password"');
  });
});

describe('the forgot-password page', () => {
  it('asks for an email address and says how long the link works', async () => {
    const { forgot } = await pages();
    const html = renderToStaticMarkup(await forgot());
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    expect(html).toContain('Reset your password');
    expect(html).toMatch(/<input[^>]*type="email"/);
    expect(html).toContain('works for an hour');
  });

  it('sends someone who is already signed in away', async () => {
    const { forgot } = await pages();
    getSession.mockResolvedValue({ user: { id: 'u1' } });
    await expect(forgot()).rejects.toMatchObject({
      digest: expect.stringContaining('NEXT_REDIRECT'),
    });
  });
});

describe('the reset-password page', () => {
  it('asks for a new password when the link brought a token, and shows the rules', async () => {
    const { reset } = await pages({ SV_AUTH_PASSWORD_MIN_LENGTH: '12' });
    const html = renderToStaticMarkup(
      await reset({ searchParams: Promise.resolve({ token: 'tok' }) }),
    );
    expect(html).toMatch(/<input[^>]*type="password"/);
    expect(html).toContain('At least 12 characters.');
    expect(html).not.toContain('tok');
  });

  it.each([
    ['no token', {}],
    ['an empty token', { token: '' }],
    ['a link that did not check out', { error: 'INVALID_TOKEN' }],
    ['a token beside an error', { token: 'tok', error: 'INVALID_TOKEN' }],
  ])('offers a new link, not a form, for %s', async (_name, query) => {
    const { reset } = await pages();
    const html = renderToStaticMarkup(await reset({ searchParams: Promise.resolve(query) }));
    expect(html).not.toMatch(/<input/);
    expect(html).toContain('expired or was already used');
    expect(html).toContain('href="/forgot-password"');
  });

  it('keeps the token out of the Referer header sent to anywhere the page links', async () => {
    const { resetMetadata } = await pages();
    expect(resetMetadata.referrer).toBe('no-referrer');
  });
});
