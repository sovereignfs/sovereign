import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ROLE_ADMIN, ROLE_USER } from '../auth/roles';
import { DEFAULT_MATRIX } from '../roles/capabilities';

const getSession = vi.fn();
vi.mock('../auth/session', () => ({ getSession: () => getSession() as unknown }));
const matrixInForce = vi.fn();
vi.mock('../roles/matrix', () => ({ getCapabilityMatrix: () => matrixInForce() as unknown }));
const revalidatePath = vi.fn();
vi.mock('next/cache', () => ({
  revalidatePath: (path: string) => revalidatePath(path) as unknown,
}));
vi.mock('../database', () => ({ getDatabase: () => Promise.resolve({ family: 'sqlite' }) }));
const removeAccess = vi.fn();
vi.mock('../oauth/revocation', () => ({
  removeAccess: (...args: unknown[]) => removeAccess(...args) as unknown,
}));

const { removeAccessAction } = await import('../../app/connected-apps/actions');

const signedInAs = (id: string, role: unknown) =>
  getSession.mockResolvedValue({ user: { id, role }, session: { id: 's1' } });
const failure = async (run: () => Promise<unknown>) => {
  try {
    await run();
  } catch (error) {
    return error as { code?: string };
  }
  return undefined;
};

beforeEach(() => {
  getSession.mockReset().mockResolvedValue(null);
  matrixInForce.mockReset().mockResolvedValue(DEFAULT_MATRIX);
  removeAccess.mockReset();
  revalidatePath.mockReset();
});

describe('removing an app’s access, as a public endpoint', () => {
  it('is refused for nobody signed in, and nothing is removed', async () => {
    expect(await failure(() => removeAccessAction('c1', null))).toMatchObject({
      code: 'unauthenticated',
    });
    expect(removeAccess).not.toHaveBeenCalled();
  });

  it('is refused for a role that does not hold profile:manage', async () => {
    signedInAs('u1', ROLE_USER);
    matrixInForce.mockResolvedValue({
      [ROLE_ADMIN]: DEFAULT_MATRIX[ROLE_ADMIN],
      [ROLE_USER]: new Set(['launcher:access']),
    });
    expect(await failure(() => removeAccessAction('c1', null))).toMatchObject({
      code: 'forbidden',
    });
    expect(removeAccess).not.toHaveBeenCalled();
  });

  it('acts on the signed-in person’s own account, whatever else is going on', async () => {
    signedInAs('me', ROLE_USER);
    removeAccess.mockResolvedValue({ consentsRemoved: 1, accessTokens: 1, refreshTokens: 1 });
    await removeAccessAction('client-9', null);
    expect(removeAccess).toHaveBeenCalledTimes(1);
    expect(removeAccess.mock.calls[0]?.slice(1)).toEqual(['me', 'client-9']);
  });

  it('says it is done, and refreshes the page', async () => {
    signedInAs('me', ROLE_USER);
    removeAccess.mockResolvedValue({ consentsRemoved: 1, accessTokens: 0, refreshTokens: 2 });
    expect(await removeAccessAction('c1', null)).toEqual({
      ok: true,
      message: 'The app no longer has access to your account.',
    });
    expect(revalidatePath).toHaveBeenCalledWith('/connected-apps');
  });

  it('says so when there was nothing to remove, rather than that it did something', async () => {
    signedInAs('me', ROLE_USER);
    removeAccess.mockResolvedValue({ consentsRemoved: 0, accessTokens: 0, refreshTokens: 0 });
    expect(await removeAccessAction('c1', null)).toEqual({
      ok: true,
      message: 'That app already had no access.',
    });
  });

  it('lets a fault through rather than saying it worked', async () => {
    signedInAs('me', ROLE_USER);
    removeAccess.mockRejectedValue(new Error('the database is down'));
    await expect(removeAccessAction('c1', null)).rejects.toThrow('database');
  });
});
