import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderServer } from './render-server';

const getSession = vi.fn();
vi.mock('../auth/session', () => ({ getSession: () => getSession() as unknown }));

const failure = async (run: () => Promise<unknown>) => {
  try {
    await run();
  } catch (error) {
    return error as { digest?: string };
  }
  return undefined;
};

async function page(environment: string) {
  vi.resetModules();
  vi.stubEnv('SV_URL', 'https://core.sovereign.local');
  vi.stubEnv('SV_AUTH_SECRET', 'a-secret-that-is-long-enough-to-pass-validation');
  vi.stubEnv('SV_ENVIRONMENT', environment);
  return (await import('../../app/lock-check/page')).default;
}

beforeEach(() => getSession.mockReset().mockResolvedValue({ user: { id: 'u1' } }));
afterEach(() => vi.unstubAllEnvs());

describe('the lock check page (task 4.15)', () => {
  it('is not there on a production instance, for anyone', async () => {
    const LockCheckPage = await page('production');
    expect((await failure(() => LockCheckPage()))?.digest).toMatch(/NEXT_HTTP_ERROR_FALLBACK;404/);
    getSession.mockResolvedValue(null);
    expect((await failure(() => LockCheckPage()))?.digest).toMatch(/NEXT_HTTP_ERROR_FALLBACK;404/);
  });

  it('sends someone not signed in to sign in, on a development or staging instance', async () => {
    getSession.mockResolvedValue(null);
    for (const environment of ['development', 'staging']) {
      const LockCheckPage = await page(environment);
      expect((await failure(() => LockCheckPage()))?.digest).toContain(
        '/sign-in?returnTo=%2Flock-check',
      );
    }
  });

  it('shows the steps to someone signed in, with the passkeys’ relying party', async () => {
    const LockCheckPage = await page('staging');
    const html = await renderServer(await LockCheckPage());
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    expect(html).toContain('Lock check');
    expect(html).toContain('Make a test passkey');
    expect(html).toContain('Copy results');
  });
});
