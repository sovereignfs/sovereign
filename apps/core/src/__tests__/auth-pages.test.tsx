import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.fn();
vi.mock('../auth/session', () => ({ getSession: () => getSession() as unknown }));
vi.mock('../auth/client', () => ({
  authClient: { signIn: { email: vi.fn() }, signUp: { email: vi.fn() }, signOut: vi.fn() },
}));

async function pages(env: Record<string, string> = {}) {
  vi.resetModules();
  vi.stubEnv('SV_URL', 'http://localhost:3000');
  vi.stubEnv('SV_AUTH_SECRET', 'a-secret-that-is-long-enough-to-pass-validation');
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
  const signIn = (await import('../../app/(auth)/sign-in/page')).default;
  const signUp = (await import('../../app/(auth)/sign-up/page')).default;
  return { signIn, signUp };
}

const search = (returnTo?: string) => Promise.resolve(returnTo === undefined ? {} : { returnTo });

beforeEach(() => getSession.mockReset().mockResolvedValue(null));
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

  it('tells the person the password rules the server will apply', async () => {
    const { signUp } = await pages({
      SV_AUTH_PASSWORD_MIN_LENGTH: '12',
      SV_AUTH_PASSWORD_REQUIRE_NUMBER: 'true',
    });
    const html = renderToStaticMarkup(await signUp({ searchParams: search() }));
    expect(html).toContain('At least 12 characters, with a number.');
  });

  it('sends someone who is already signed in away', async () => {
    const { signUp } = await pages();
    getSession.mockResolvedValue({ user: { id: 'u1' } });
    await expect(signUp({ searchParams: search() })).rejects.toMatchObject({
      digest: expect.stringContaining('NEXT_REDIRECT'),
    });
  });
});
