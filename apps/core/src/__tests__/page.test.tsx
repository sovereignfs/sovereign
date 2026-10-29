import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LauncherApp } from '../clients/launcher';
import { ROLE_ADMIN, ROLE_OWNER, ROLE_USER } from '../auth/roles';
import { DEFAULT_MATRIX } from '../roles/capabilities';

const getSession = vi.fn();
vi.mock('../auth/session', () => ({ getSession: () => getSession() as unknown }));
vi.mock('../auth/client', () => ({ authClient: { signOut: vi.fn() } }));
const matrix = vi.fn();
vi.mock('../roles/matrix', () => ({ getCapabilityMatrix: () => matrix() as unknown }));
const getLauncherApps = vi.fn();
vi.mock('../clients', () => ({ getLauncherApps: () => getLauncherApps() as unknown }));
// The header reads the session, the matrix and the instance itself; it is tested on its own (account-header.test.tsx).
vi.mock('../../app/account-header', () => ({ AccountHeader: () => <header>the header</header> }));
vi.mock('next/link', () => ({
  default: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a>,
}));

const { default: Page } = await import('../../app/page');

const app = (id: string, extra: Partial<LauncherApp> = {}): LauncherApp => ({
  id,
  name: `App ${id}`,
  description: `About ${id}`,
  icon: undefined,
  launchUrl: `https://${id}.example`,
  ...extra,
});
const as = (role: unknown) =>
  getSession.mockResolvedValue({
    user: { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com', role },
  });
const links = (html: string) => [...html.matchAll(/<a [^>]*href="([^"]+)"/g)].map((m) => m[1]);

beforeEach(() => {
  getSession.mockReset();
  matrix.mockReset().mockResolvedValue(DEFAULT_MATRIX);
  getLauncherApps.mockReset().mockResolvedValue([]);
});

describe('the home page, which is the launcher', () => {
  it('says what it is, in one level-one heading, and who is signed in, under the header', async () => {
    as(ROLE_USER);
    const html = renderToStaticMarkup(await Page());
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    expect(html).toContain('>Apps</h1>');
    expect(html).toContain('Ada Lovelace');
    expect(html.indexOf('the header')).toBeLessThan(html.indexOf('>Apps</h1>'));
  });

  it('lists the apps, each an ordinary link to its launch address in the same tab', async () => {
    as(ROLE_USER);
    getLauncherApps.mockResolvedValue([app('one'), app('two')]);
    const html = renderToStaticMarkup(await Page());
    expect(links(html)).toEqual(
      expect.arrayContaining(['https://one.example', 'https://two.example']),
    );
    expect(html).toContain('App one');
    expect(html).toContain('About two');
    expect(html).not.toMatch(/target="_blank"/);
  });

  it('is for those who hold launcher:access: someone without it sees no apps and no list is read', async () => {
    as(ROLE_USER);
    matrix.mockResolvedValue({
      [ROLE_ADMIN]: DEFAULT_MATRIX[ROLE_ADMIN],
      [ROLE_USER]: new Set(['profile:manage']),
    });
    getLauncherApps.mockResolvedValue([app('one')]);
    const html = renderToStaticMarkup(await Page());
    expect(getLauncherApps).not.toHaveBeenCalled();
    expect(html).not.toContain('App one');
    expect(html).toContain('You do not have access to the apps on this instance.');
    expect(links(html)).toEqual([]);
  });

  it('judges by the matrix in force: an owner is always let in, an admin who lost it is not', async () => {
    as(ROLE_ADMIN);
    matrix.mockResolvedValue({
      [ROLE_ADMIN]: new Set(['profile:manage', 'console:access']),
      [ROLE_USER]: new Set(['profile:manage', 'launcher:access']),
    });
    await Page();
    expect(getLauncherApps).not.toHaveBeenCalled();
    as(ROLE_OWNER);
    await Page();
    expect(getLauncherApps).toHaveBeenCalledTimes(1);
  });

  it('invites an operator to add the first app, and tells anyone else whom to ask', async () => {
    as(ROLE_ADMIN);
    const forOperator = renderToStaticMarkup(await Page());
    expect(forOperator).toContain('No apps yet');
    expect(forOperator).toContain('href="/console/apps/new"');
    as(ROLE_USER);
    const forPerson = renderToStaticMarkup(await Page());
    expect(forPerson).toContain('No apps yet');
    expect(forPerson).toContain('Ask whoever runs it.');
    expect(forPerson).not.toContain('/console/apps/new');
  });

  it('is drawn with the design system and carries no inline styling or scripts of its own', async () => {
    as(ROLE_USER);
    getLauncherApps.mockResolvedValue([app('one')]);
    const html = renderToStaticMarkup(await Page()).replace(/<script[\s\S]*?<\/script>/g, '');
    expect(html).not.toMatch(/<script|<style/);
  });

  it('sends a visitor with no valid session to sign-in, whatever the proxy let through', async () => {
    getSession.mockResolvedValue(null);
    await expect(Page()).rejects.toMatchObject({ digest: expect.stringContaining('/sign-in') });
    expect(getLauncherApps).not.toHaveBeenCalled();
  });
});
