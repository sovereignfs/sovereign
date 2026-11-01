import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ROLE_ADMIN, ROLE_OWNER, ROLE_USER, ROLES } from '../auth/roles';
import { ALL_CAPABILITIES, DEFAULT_MATRIX, can, type Matrix } from '../roles/capabilities';

const getSession = vi.fn();
vi.mock('../auth/session', () => ({ getSession: () => getSession() as unknown }));
// The matrix in force is read from the database; here it is whatever the test says.
const matrixInForce = vi.fn<() => Promise<Matrix>>();
vi.mock('../roles/matrix', () => ({ getCapabilityMatrix: () => matrixInForce() }));

const { AuthorizationError, authorizationResponse, requireCapability, requireSession } =
  await import('../auth/authorize');

const signedInAs = (role: unknown) =>
  getSession.mockResolvedValue({ user: { id: 'u1', role, email: 'a@sovereign.local' } });

beforeEach(() => {
  getSession.mockReset().mockResolvedValue(null);
  matrixInForce.mockReset().mockResolvedValue(DEFAULT_MATRIX);
});

const failure = async (run: () => Promise<unknown>) => {
  try {
    await run();
  } catch (error) {
    return error;
  }
  return undefined;
};

describe('requireSession', () => {
  it('gives the signed-in person', async () => {
    signedInAs(ROLE_USER);
    await expect(requireSession()).resolves.toMatchObject({ user: { id: 'u1' } });
  });

  it('refuses nobody being signed in, as unauthenticated', async () => {
    const error = await failure(requireSession);
    expect(error).toBeInstanceOf(AuthorizationError);
    expect(error).toMatchObject({ code: 'unauthenticated' });
  });
});

describe('requireCapability', () => {
  it.each(
    ROLES.flatMap((role) => ALL_CAPABILITIES.map((capability) => [role, capability] as const)),
  )('for %s asking for %s agrees with the matrix', async (role, capability) => {
    signedInAs(role);
    const error = await failure(() => requireCapability(capability));
    if (can(role, capability)) expect(error).toBeUndefined();
    else expect(error).toMatchObject({ code: 'forbidden', capability });
  });

  it('judges by the matrix in force, not the default: an edited one changes the answer', async () => {
    const edited: Matrix = {
      [ROLE_ADMIN]: new Set(['profile:manage']),
      [ROLE_USER]: new Set(['profile:manage', 'user:view']),
    };
    matrixInForce.mockResolvedValue(edited);
    signedInAs(ROLE_ADMIN);
    expect(await failure(() => requireCapability('user:manage'))).toMatchObject({
      code: 'forbidden',
    });
    signedInAs(ROLE_USER);
    expect(await failure(() => requireCapability('user:view'))).toBeUndefined();
  });

  it('is refused when the matrix cannot be read, rather than falling back to a more generous one', async () => {
    matrixInForce.mockRejectedValue(new Error('database is down'));
    signedInAs(ROLE_ADMIN);
    expect(await failure(() => requireCapability('user:manage'))).toMatchObject({
      message: 'database is down',
    });
  });

  it('refuses nobody being signed in as unauthenticated, not forbidden', async () => {
    expect(await failure(() => requireCapability('profile:manage'))).toMatchObject({
      code: 'unauthenticated',
    });
  });

  it.each([undefined, null, '', 'platform:superuser', 'owner'])(
    'refuses a role it does not know (%j) every capability',
    async (role) => {
      signedInAs(role);
      for (const capability of ALL_CAPABILITIES) {
        expect(await failure(() => requireCapability(capability))).toMatchObject({
          code: 'forbidden',
        });
      }
    },
  );

  it('hands back the session, so the action uses who it was checked for', async () => {
    signedInAs(ROLE_ADMIN);
    const session = await requireCapability('user:manage');
    expect(session.user.id).toBe('u1');
  });
});

describe('a server action, called directly', () => {
  // The shape every action takes: check first, then act. A page's guard is not in the way when the
  // action is posted to directly.
  const removed: string[] = [];
  async function deleteClient(id: string) {
    await requireCapability('client:manage');
    removed.push(id);
  }
  beforeEach(() => (removed.length = 0));

  it('is refused for a role without the capability, and does nothing', async () => {
    signedInAs(ROLE_USER);
    expect(await failure(() => deleteClient('app-1'))).toMatchObject({ code: 'forbidden' });
    expect(removed).toEqual([]);
  });

  it('is refused for nobody signed in, and does nothing', async () => {
    expect(await failure(() => deleteClient('app-1'))).toMatchObject({ code: 'unauthenticated' });
    expect(removed).toEqual([]);
  });

  it('runs for a role that has it', async () => {
    signedInAs(ROLE_ADMIN);
    await deleteClient('app-1');
    expect(removed).toEqual(['app-1']);
  });

  it('keeps an owner-only action from an admin', async () => {
    signedInAs(ROLE_ADMIN);
    expect(await failure(() => requireCapability('role:assign'))).toMatchObject({
      code: 'forbidden',
    });
    signedInAs(ROLE_OWNER);
    expect(await failure(() => requireCapability('role:assign'))).toBeUndefined();
  });
});

describe('authorizationResponse', () => {
  it('is a 401 for nobody signed in and a 403 for someone who may not, never cached', async () => {
    const unauthenticated = authorizationResponse(new AuthorizationError('unauthenticated'));
    const forbidden = authorizationResponse(new AuthorizationError('forbidden', 'user:manage'));
    expect(unauthenticated?.status).toBe(401);
    expect(forbidden?.status).toBe(403);
    expect(unauthenticated?.headers.get('cache-control')).toBe('no-store');
    expect(await forbidden?.json()).toEqual({ error: 'forbidden' });
  });

  it('does not say which capability was missing', async () => {
    const forbidden = authorizationResponse(new AuthorizationError('forbidden', 'role:assign'));
    expect(JSON.stringify(await forbidden?.json())).not.toContain('role:assign');
  });

  it('is nothing for any other error, which the route should rethrow', () => {
    expect(authorizationResponse(new Error('boom'))).toBeUndefined();
    expect(authorizationResponse('forbidden')).toBeUndefined();
  });
});
