import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderServer } from './render-server';

const getSession = vi.fn();
vi.mock('../auth/session', () => ({ getSession: () => getSession() as unknown }));
vi.mock('../roles/matrix', async () => {
  const { DEFAULT_MATRIX } = await import('../roles/capabilities');
  return { getCapabilityMatrix: () => Promise.resolve(DEFAULT_MATRIX) };
});
const as = (role: string) => getSession.mockResolvedValue({ user: { id: 'u1', role } });

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

beforeEach(() => {
  getSession.mockReset();
  as('platform:user');
});
afterEach(() => vi.unstubAllEnvs());

describe('the lock check page (task 4.15)', () => {
  it('is not there on a production instance, for anyone but the owner', async () => {
    const LockCheckPage = await page('production');
    for (const role of ['platform:user', 'platform:admin']) {
      as(role);
      expect((await failure(() => LockCheckPage()))?.digest, role).toMatch(
        /NEXT_HTTP_ERROR_FALLBACK;404/,
      );
    }
  });

  it('is there on a production instance for the owner, who alone holds instance:diagnose', async () => {
    const LockCheckPage = await page('production');
    as('platform:owner');
    expect(await renderServer(await LockCheckPage())).toContain('Make a test passkey');
  });

  it('is anyone’s who is signed in on a development or staging instance', async () => {
    for (const environment of ['development', 'staging']) {
      const LockCheckPage = await page(environment);
      as('platform:user');
      expect(await renderServer(await LockCheckPage())).toContain('Lock check');
    }
  });

  it('sends someone not signed in to sign in, on every instance', async () => {
    getSession.mockResolvedValue(null);
    for (const environment of ['development', 'staging', 'production']) {
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
