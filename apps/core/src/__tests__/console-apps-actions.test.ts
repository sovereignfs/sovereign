import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ROLE_ADMIN, ROLE_OWNER, ROLE_USER } from '../auth/roles';
import { DEFAULT_MATRIX } from '../roles/capabilities';
import { ClientRegistryError } from '../clients/registry';

const getSession = vi.fn();
vi.mock('../auth/session', () => ({ getSession: () => getSession() as unknown }));
const matrixInForce = vi.fn();
vi.mock('../roles/matrix', () => ({ getCapabilityMatrix: () => matrixInForce() as unknown }));
const revalidatePath = vi.fn();
vi.mock('next/cache', () => ({
  revalidatePath: (path: string) => revalidatePath(path) as unknown,
}));
const redirect = vi.fn();
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    redirect(to);
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
}));
vi.mock('next/headers', () => ({
  headers: () => Promise.resolve(new Headers({ cookie: 'session=abc' })),
}));

const registry = {
  register: vi.fn(),
  update: vi.fn(),
  setEnabled: vi.fn(),
  rotateSecret: vi.fn(),
  remove: vi.fn(),
};
vi.mock('../clients', async (original) => ({
  ...(await original<typeof import('../clients')>()),
  getClientRegistry: () => Promise.resolve(registry),
}));

const actions = await import('../../app/console/apps/actions');

const form = (entries: [string, string][]) => {
  const data = new FormData();
  for (const [name, value] of entries) data.append(name, value);
  return data;
};
const signedInAs = (role: unknown) =>
  getSession.mockResolvedValue({ user: { id: 'u1', role }, session: { id: 's1' } });
const failure = async (run: () => Promise<unknown>) => {
  try {
    await run();
  } catch (error) {
    return error as { code?: string; message: string };
  }
  return undefined;
};
const NEW_APP: [string, string][] = [
  ['name', 'Notes'],
  ['redirectUris', 'https://notes.example/cb'],
  ['scope', 'openid'],
  ['show', 'on'],
];

beforeEach(() => {
  getSession.mockReset().mockResolvedValue(null);
  matrixInForce.mockReset().mockResolvedValue(DEFAULT_MATRIX);
  for (const mock of Object.values(registry)) mock.mockReset();
  revalidatePath.mockReset();
  redirect.mockReset();
});

describe('what an operator asks of apps, as a public endpoint', () => {
  const everything = [
    () => actions.registerAppAction(null, form(NEW_APP)),
    () => actions.updateAppAction('c1', null, form(NEW_APP)),
    () => actions.setAppEnabledAction('c1', false, null),
    () => actions.rotateSecretAction('c1', null),
    () => actions.deleteAppAction('c1', null),
  ];

  it('refuses nobody, and an ordinary person, before the registry is touched', async () => {
    for (const call of everything) {
      getSession.mockResolvedValue(null);
      expect(await failure(call)).toMatchObject({ code: 'unauthenticated' });
      signedInAs(ROLE_USER);
      expect(await failure(call)).toMatchObject({ code: 'forbidden' });
    }
    for (const mock of Object.values(registry)) expect(mock).not.toHaveBeenCalled();
  });

  it('judges by the matrix in force: an admin who has lost client:manage is refused', async () => {
    signedInAs(ROLE_ADMIN);
    matrixInForce.mockResolvedValue({
      // Everything an admin has by default except client:manage, so only that can be the reason.
      [ROLE_ADMIN]: new Set([
        'profile:manage',
        'launcher:access',
        'console:access',
        'user:view',
        'user:manage',
        'instance:view',
        'instance:configure',
      ]),
      [ROLE_USER]: new Set(['profile:manage']),
    });
    expect(await failure(everything[0] as () => Promise<unknown>)).toMatchObject({
      code: 'forbidden',
    });
    expect(registry.register).not.toHaveBeenCalled();
  });

  it('hands the registry the person and the request’s own headers, for the provider to see who asks', async () => {
    signedInAs(ROLE_ADMIN);
    registry.register.mockResolvedValue({ client: { clientId: 'c1' }, secret: 's3cret' });
    await actions.registerAppAction(null, form(NEW_APP));
    const [actor] = registry.register.mock.calls[0] as [{ user: { id: string }; headers: Headers }];
    expect(actor.user).toMatchObject({ id: 'u1', role: ROLE_ADMIN });
    expect(actor.headers.get('cookie')).toBe('session=abc');
  });
});

describe('adding an app', () => {
  it('sends what the form says, and shows the secret in the answer, once', async () => {
    signedInAs(ROLE_OWNER);
    registry.register.mockResolvedValue({ client: { clientId: 'c1' }, secret: 's3cret' });
    const result = await actions.registerAppAction(null, form([...NEW_APP, ['type', 'public']]));
    expect(result).toEqual({
      ok: true,
      message: 'The app is added. Copy its secret now: it is shown once.',
      id: 'c1',
      secret: 's3cret',
    });
    expect(registry.register.mock.calls[0]?.[1]).toMatchObject({
      name: 'Notes',
      type: 'public',
      redirectUris: ['https://notes.example/cb'],
      scopes: ['openid'],
      launcher: { show: true },
    });
    expect(revalidatePath).toHaveBeenCalledWith('/console/apps');
  });

  it('has no secret to show for an app that keeps none', async () => {
    signedInAs(ROLE_OWNER);
    registry.register.mockResolvedValue({ client: { clientId: 'c2' }, secret: undefined });
    const result = await actions.registerAppAction(null, form(NEW_APP));
    expect(result).toEqual({ ok: true, message: 'The app is added.', id: 'c2' });
  });

  it('says everything wrong at once, each by its field, and refreshes nothing', async () => {
    signedInAs(ROLE_OWNER);
    registry.register.mockRejectedValue(
      new ClientRegistryError('invalid', 'Some of what was entered cannot be used.', [
        { field: 'name', message: 'is required' },
        { field: 'redirectUris', message: 'address 1 must be https' },
      ]),
    );
    expect(await actions.registerAppAction(null, form([['name', '']]))).toEqual({
      ok: false,
      error: 'Some of what was entered cannot be used.',
      fields: { name: 'The name is required.', redirectUris: 'Address 1 must be https.' },
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('throws what is not an expected refusal, rather than hiding it', async () => {
    signedInAs(ROLE_OWNER);
    registry.register.mockRejectedValue(new Error('the database is down'));
    await expect(actions.registerAppAction(null, form(NEW_APP))).rejects.toThrow('database');
  });
});

describe('changing an app', () => {
  it('sends the whole form for that app, says so, and refreshes both pages', async () => {
    signedInAs(ROLE_OWNER);
    registry.update.mockResolvedValue({});
    expect(await actions.updateAppAction('c1', null, form(NEW_APP))).toEqual({
      ok: true,
      message: 'The changes are saved.',
    });
    expect(registry.update.mock.calls[0]?.[1]).toBe('c1');
    expect(revalidatePath).toHaveBeenCalledWith('/console/apps');
    expect(revalidatePath).toHaveBeenCalledWith('/console/apps/c1');
  });

  it('shows what is wrong beside the field', async () => {
    signedInAs(ROLE_OWNER);
    registry.update.mockRejectedValue(
      new ClientRegistryError('invalid', 'Some of what was entered cannot be used.', [
        { field: 'scopes', message: 'roles is only for a trusted app' },
      ]),
    );
    expect(await actions.updateAppAction('c1', null, form(NEW_APP))).toMatchObject({
      ok: false,
      fields: { scope: 'Roles is only for a trusted app.' },
    });
  });

  it('says so in words when the app is not there', async () => {
    signedInAs(ROLE_OWNER);
    registry.update.mockRejectedValue(
      new ClientRegistryError('not-found', 'There is no such app.'),
    );
    expect(await actions.updateAppAction('gone', null, form(NEW_APP))).toMatchObject({
      ok: false,
      error: 'There is no such app.',
    });
  });
});

describe('switching an app off and on', () => {
  it('says which it did', async () => {
    signedInAs(ROLE_OWNER);
    registry.setEnabled.mockResolvedValue({});
    expect(await actions.setAppEnabledAction('c1', false, null)).toEqual({
      ok: true,
      message: 'The app is switched off.',
    });
    expect(await actions.setAppEnabledAction('c1', true, null)).toEqual({
      ok: true,
      message: 'The app is on again.',
    });
    expect(registry.setEnabled.mock.calls.map((call) => call[2])).toEqual([false, true]);
  });
});

describe('a new secret', () => {
  it('is in the answer and says the old one has stopped', async () => {
    signedInAs(ROLE_OWNER);
    registry.rotateSecret.mockResolvedValue('n3w');
    const result = await actions.rotateSecretAction('c1', null);
    expect(result).toMatchObject({ ok: true, secret: 'n3w' });
    expect((result as { message: string }).message).toContain('old one has stopped working');
  });

  it('says so for an app that has none', async () => {
    signedInAs(ROLE_OWNER);
    registry.rotateSecret.mockRejectedValue(
      new ClientRegistryError('public-client', 'A public app has no secret to rotate.'),
    );
    expect(await actions.rotateSecretAction('c1', null)).toEqual({
      ok: false,
      error: 'A public app has no secret to rotate.',
    });
  });
});

describe('deleting an app', () => {
  it('deletes, then leaves for the list', async () => {
    signedInAs(ROLE_OWNER);
    registry.remove.mockResolvedValue(undefined);
    expect((await failure(() => actions.deleteAppAction('c1', null)))?.message).toBe(
      'NEXT_REDIRECT /console/apps',
    );
    expect(registry.remove.mock.calls[0]?.[1]).toBe('c1');
    expect(revalidatePath).toHaveBeenCalledWith('/console/apps');
  });

  it('stays, with the reason, when it cannot', async () => {
    signedInAs(ROLE_OWNER);
    registry.remove.mockRejectedValue(
      new ClientRegistryError('not-found', 'There is no such app.'),
    );
    expect(await actions.deleteAppAction('c1', null)).toEqual({
      ok: false,
      error: 'There is no such app.',
    });
    expect(redirect).not.toHaveBeenCalled();
  });
});
