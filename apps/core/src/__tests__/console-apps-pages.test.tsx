import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ROLE_ADMIN, ROLE_OWNER, ROLE_USER } from '../auth/roles';
import { ClientRegistryError, type ClientView } from '../clients/registry';
import { DEFAULT_MATRIX } from '../roles/capabilities';

const getSession = vi.fn();
vi.mock('../auth/session', () => ({ getSession: () => getSession() as unknown }));
const matrixInForce = vi.fn();
vi.mock('../roles/matrix', () => ({ getCapabilityMatrix: () => matrixInForce() as unknown }));
vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('next/link', () => ({
  default: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a>,
}));
const list = vi.fn();
const get = vi.fn();
const managedClientIds = vi.fn();
vi.mock('../clients', async (original) => ({
  ...(await original<typeof import('../clients')>()),
  getClientRegistry: () => Promise.resolve({ list, get, managedClientIds }),
}));
vi.mock('../../app/console/apps/actions', () => ({
  registerAppAction: vi.fn(),
  updateAppAction: vi.fn(),
  setAppEnabledAction: vi.fn(),
  rotateSecretAction: vi.fn(),
  deleteAppAction: vi.fn(),
}));

const { default: AppsPage } = await import('../../app/console/apps/page');
const { default: NewAppPage } = await import('../../app/console/apps/new/page');
const { default: AppPage } = await import('../../app/console/apps/[id]/page');

const app = (id: string, extra: Partial<ClientView> = {}): ClientView => ({
  clientId: id,
  name: `App ${id}`,
  type: 'confidential',
  secretIn: 'header',
  idTokenAlgorithm: 'EdDSA',
  redirectUris: ['https://a.example/cb'],
  postLogoutRedirectUris: [],
  backchannelLogoutUri: undefined,
  endSession: false,
  scopes: ['openid', 'profile'],
  trusted: false,
  enabled: true,
  launcher: {
    description: 'Does things',
    icon: undefined,
    launchUrl: 'https://a.example',
    show: true,
  },
  createdAt: new Date(Date.UTC(2026, 9, 1, 9, 0)),
  ...extra,
});
const as = (role: unknown) => getSession.mockResolvedValue({ user: { id: 'x', role } });
const failure = async (run: () => Promise<unknown>) => {
  try {
    await run();
  } catch (error) {
    return error as { digest?: string };
  }
  return undefined;
};
const NOT_FOUND = 'NEXT_HTTP_ERROR_FALLBACK;404';
const visible = (html: string) =>
  html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]*>/g, ' ');

beforeEach(() => {
  getSession.mockReset().mockResolvedValue(null);
  matrixInForce.mockReset().mockResolvedValue(DEFAULT_MATRIX);
  list.mockReset().mockResolvedValue([]);
  get.mockReset();
  managedClientIds.mockReset().mockResolvedValue(new Set());
});

describe('the apps pages', () => {
  it('are for those who manage apps, and pages that are not there for anyone else', async () => {
    for (const page of [
      () => AppsPage(),
      () => NewAppPage(),
      () => AppPage({ params: Promise.resolve({ id: 'c1' }) }),
    ]) {
      as(ROLE_USER);
      expect((await failure(page))?.digest).toBe(NOT_FOUND);
      getSession.mockResolvedValue(null);
      expect((await failure(page))?.digest).toContain('/sign-in');
    }
    expect(list).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
  });

  it('ask for client:manage themselves, not only for the Console', async () => {
    as(ROLE_ADMIN);
    matrixInForce.mockResolvedValue({
      [ROLE_ADMIN]: new Set(['profile:manage', 'console:access', 'user:view', 'user:manage']),
      [ROLE_USER]: new Set(['profile:manage']),
    });
    expect((await failure(() => AppsPage()))?.digest).toBe(NOT_FOUND);
    expect(list).not.toHaveBeenCalled();
  });
});

describe('the list of apps', () => {
  it('invites the operator to add the first one, when there is none', async () => {
    as(ROLE_ADMIN);
    const html = renderToStaticMarkup(await AppsPage());
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    expect(html).toContain('No apps yet');
    expect(html).toContain('href="/console/apps/new"');
  });

  it('lists each app with whether it is on and in the launcher, linking to it', async () => {
    as(ROLE_ADMIN);
    list.mockResolvedValue([
      app('c1'),
      app('c2', { enabled: false }),
      app('c3', {
        launcher: { description: undefined, icon: undefined, launchUrl: undefined, show: true },
      }),
    ]);
    const html = renderToStaticMarkup(await AppsPage());
    expect(html).toContain('href="/console/apps/c1"');
    expect(html).toContain('App c2');
    expect(html).toContain('Switched off');
    const rows = html.split('<tr').slice(2);
    expect(visible(rows[0] ?? '')).toMatch(/Yes/);
    expect(visible(rows[1] ?? '')).toMatch(/No/);
    expect(visible(rows[2] ?? '')).toMatch(/No/);
  });

  it('says “app”, never “client”, where an operator is not in the technical settings', async () => {
    as(ROLE_ADMIN);
    list.mockResolvedValue([app('c1')]);
    expect(visible(renderToStaticMarkup(await AppsPage()))).not.toMatch(/client/i);
    expect(visible(renderToStaticMarkup(await NewAppPage()))).not.toMatch(/client/i);
  });

  it('says which apps are managed from the command line, and only those, without the word “client”', async () => {
    as(ROLE_ADMIN);
    list.mockResolvedValue([app('c1'), app('c2')]);
    managedClientIds.mockResolvedValue(new Set(['c2']));
    const text = visible(renderToStaticMarkup(await AppsPage()));
    expect(text.match(/managed from the command line/g)).toHaveLength(1);
    expect(text).not.toMatch(/client/i);
  });

  it('asks the registry as the person who is signed in', async () => {
    as(ROLE_OWNER);
    await AppsPage();
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ user: expect.objectContaining({ role: ROLE_OWNER }) }),
    );
  });
});

describe('the page to add an app', () => {
  it('has one heading and the form, with the settings for app authors folded away', async () => {
    as(ROLE_OWNER);
    const html = renderToStaticMarkup(await NewAppPage());
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    expect(html).toMatch(/<input[^>]*name="name"/);
    expect(html).toMatch(/<textarea[^>]*name="redirectUris"/);
    expect(html).toMatch(/<select[^>]*name="type"/);
    expect(html).toContain('Add the app');
    expect(html).toMatch(/aria-expanded="false"/);
  });
});

describe('the page of one app', () => {
  const page = () => AppPage({ params: Promise.resolve({ id: 'c1' }) });

  it('says a managed app is managed from the command line, what that means, and says nothing of it for others', async () => {
    as(ROLE_OWNER);
    get.mockResolvedValue(app('c1'));
    expect(visible(renderToStaticMarkup(await page()))).not.toContain(
      'managed from the command line',
    );
    managedClientIds.mockResolvedValue(new Set(['c1']));
    const text = visible(renderToStaticMarkup(await page()));
    expect(text).toContain('managed from the command line');
    expect(text).toContain('overwritten the next time it is deployed');
    expect(text).toContain('a new secret');
  });

  it('shows the app, its ID to copy, what kind it is, and the form with what it has', async () => {
    as(ROLE_OWNER);
    get.mockResolvedValue(app('c1'));
    const html = renderToStaticMarkup(await page());
    expect(html).toContain('App c1');
    expect(html).toContain('Client ID');
    expect(html).toContain('>c1<');
    expect(html).toContain('Keeps a secret on its own server');
    expect(html).toMatch(/<input[^>]*name="name"[^>]*value="App c1"/);
    expect(html).toContain('https://a.example/cb');
    expect(html).not.toMatch(/<select[^>]*name="type"/);
    expect(html).toContain('Save changes');
  });

  it('offers a new secret only to an app that keeps one', async () => {
    as(ROLE_OWNER);
    get.mockResolvedValue(app('c1'));
    expect(renderToStaticMarkup(await page())).toContain('Make a new secret');
    get.mockResolvedValue(app('c1', { type: 'public' }));
    const html = renderToStaticMarkup(await page());
    expect(html).not.toContain('Make a new secret');
    expect(html).toContain('no secret');
  });

  it('offers to switch it off while it is on, and on while it is off', async () => {
    as(ROLE_OWNER);
    get.mockResolvedValue(app('c1'));
    expect(visible(renderToStaticMarkup(await page()))).toContain('Switch off');
    get.mockResolvedValue(app('c1', { enabled: false }));
    const html = renderToStaticMarkup(await page());
    expect(html).toContain('Switch on');
    expect(html).toContain('Switched off');
  });

  it('is a page that is not there for an app that is not there', async () => {
    as(ROLE_OWNER);
    get.mockRejectedValue(new ClientRegistryError('not-found', 'There is no such app.'));
    expect((await failure(page))?.digest).toBe(NOT_FOUND);
  });

  it('lets any other fault through rather than hiding it as a missing page', async () => {
    as(ROLE_OWNER);
    get.mockRejectedValue(new Error('boom'));
    await expect(page()).rejects.toThrow('boom');
  });
});
