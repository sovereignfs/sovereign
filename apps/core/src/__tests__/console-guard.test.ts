import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ROLE_ADMIN, ROLE_OWNER, ROLE_USER } from '../auth/roles';
import { DEFAULT_MATRIX, type Matrix } from '../roles/capabilities';

const getSession = vi.fn();
vi.mock('../auth/session', () => ({ getSession: () => getSession() as unknown }));
const matrixInForce = vi.fn<() => Promise<Matrix>>();
vi.mock('../roles/matrix', () => ({ getCapabilityMatrix: () => matrixInForce() }));

const { requireConsole } = await import('../console/guard');

const as = (role: unknown) => getSession.mockResolvedValue({ user: { id: 'u1', role } });
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
});

describe('entering the Console', () => {
  it('sends someone who is not signed in to sign in, and back to the page they asked for', async () => {
    expect((await failure(() => requireConsole()))?.digest).toContain(
      '/sign-in?returnTo=%2Fconsole',
    );
    expect(
      (await failure(() => requireConsole('console:access', { returnTo: '/console/accounts' })))
        ?.digest,
    ).toContain('/sign-in?returnTo=%2Fconsole%2Faccounts');
  });

  it.each([ROLE_ADMIN, ROLE_OWNER])('lets %s in, with the sections they may see', async (role) => {
    as(role);
    const { session, sections } = await requireConsole();
    expect(session.user.id).toBe('u1');
    expect(sections.length).toBeGreaterThan(0);
  });

  it.each([ROLE_USER, 'platform:superuser', undefined, null, ''])(
    'shows %j a page that is not there, and says nothing of what is missing',
    async (role) => {
      as(role);
      const error = await failure(() => requireConsole());
      expect(error?.digest).toBe('NEXT_HTTP_ERROR_FALLBACK;404');
    },
  );

  it('asks for the capability a page needs as well as for entry', async () => {
    as(ROLE_ADMIN);
    expect(await failure(() => requireConsole('user:view'))).toBeUndefined();
    const error = await failure(() => requireConsole('capability:configure'));
    expect(error?.digest).toBe('NEXT_HTTP_ERROR_FALLBACK;404');
  });

  it('needs entry as well as the page’s own capability: a role that holds the one without the other is turned away', async () => {
    as(ROLE_ADMIN);
    matrixInForce.mockResolvedValue({
      [ROLE_ADMIN]: new Set(['profile:manage', 'user:view']),
      [ROLE_USER]: new Set(['profile:manage']),
    });
    expect((await failure(() => requireConsole('user:view')))?.digest).toBe(
      'NEXT_HTTP_ERROR_FALLBACK;404',
    );
    matrixInForce.mockResolvedValue({
      [ROLE_ADMIN]: new Set(['profile:manage', 'console:access']),
      [ROLE_USER]: new Set(['profile:manage']),
    });
    expect((await failure(() => requireConsole('user:view')))?.digest).toBe(
      'NEXT_HTTP_ERROR_FALLBACK;404',
    );
  });

  it('lets the owner into an owner’s page, and an admin not', async () => {
    as(ROLE_OWNER);
    expect(await failure(() => requireConsole('ownership:transfer'))).toBeUndefined();
    as(ROLE_ADMIN);
    expect((await failure(() => requireConsole('ownership:transfer')))?.digest).toBe(
      'NEXT_HTTP_ERROR_FALLBACK;404',
    );
  });

  it('follows the matrix in force at the moment of the request', async () => {
    as(ROLE_ADMIN);
    expect(await failure(() => requireConsole())).toBeUndefined();
    matrixInForce.mockResolvedValue({
      [ROLE_ADMIN]: new Set(['profile:manage']),
      [ROLE_USER]: new Set(['profile:manage']),
    });
    expect((await failure(() => requireConsole()))?.digest).toBe('NEXT_HTTP_ERROR_FALLBACK;404');
  });

  it('fails when the matrix cannot be read, rather than letting anyone in', async () => {
    as(ROLE_ADMIN);
    matrixInForce.mockRejectedValue(new Error('database is down'));
    expect(await failure(() => requireConsole())).toMatchObject({ message: 'database is down' });
  });

  it('is judged by the role as the database has it, so a demoted admin is turned away at once', async () => {
    as(ROLE_ADMIN);
    expect(await failure(() => requireConsole())).toBeUndefined();
    as(ROLE_USER);
    expect((await failure(() => requireConsole()))?.digest).toBe('NEXT_HTTP_ERROR_FALLBACK;404');
  });
});
