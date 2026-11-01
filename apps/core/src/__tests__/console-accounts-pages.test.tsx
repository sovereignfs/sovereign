import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccountDetail, AccountSummary } from '../accounts/manage';
import { ROLE_ADMIN, ROLE_OWNER, ROLE_USER } from '../auth/roles';
import { DEFAULT_MATRIX } from '../roles/capabilities';

const getSession = vi.fn();
vi.mock('../auth/session', () => ({ getSession: () => getSession() as unknown }));
vi.mock('../roles/matrix', () => ({ getCapabilityMatrix: () => Promise.resolve(DEFAULT_MATRIX) }));
vi.mock('../database', () => ({ getDatabase: () => Promise.resolve({}) }));
const listAccounts = vi.fn();
const getAccount = vi.fn();
vi.mock('../accounts', () => ({
  listAccounts: (...args: unknown[]) => listAccounts(...args) as unknown,
  getAccount: (...args: unknown[]) => getAccount(...args) as unknown,
  getAccountManager: vi.fn(),
  AccountActionError: class extends Error {},
}));
vi.mock('../../app/console/accounts/actions', () => ({
  deactivateAction: vi.fn(),
  reactivateAction: vi.fn(),
  resetMfaAction: vi.fn(),
  deleteAction: vi.fn(),
  changeRoleAction: vi.fn(),
}));
vi.mock('next/navigation', async (original) => ({
  ...(await original<typeof import('next/navigation')>()),
  useRouter: () => ({ push: vi.fn() }),
}));

const { default: AccountsPage } = await import('../../app/console/accounts/page');
const { default: AccountPage } = await import('../../app/console/accounts/[id]/page');

const summary = (
  id: string,
  role: string,
  extra: Partial<AccountSummary> = {},
): AccountSummary => ({
  id,
  name: `Name of ${id}`,
  email: `${id}@sovereign.local`,
  role,
  emailVerified: true,
  twoFactorEnabled: false,
  deactivatedAt: undefined,
  createdAt: Date.UTC(2026, 9, 1, 9, 0),
  ...extra,
});
const detail = (id: string, role: string, extra: Partial<AccountDetail> = {}): AccountDetail => ({
  ...summary(id, role),
  passkeys: 0,
  sessions: 1,
  timezone: undefined,
  locale: undefined,
  image: undefined,
  ...extra,
});
const page = (accounts: AccountSummary[], extra: Record<string, unknown> = {}) => ({
  accounts,
  total: accounts.length,
  page: 1,
  pages: 1,
  pageSize: 25,
  ...extra,
});

const as = (id: string, role: unknown) => getSession.mockResolvedValue({ user: { id, role } });
const failure = async (run: () => Promise<unknown>) => {
  try {
    await run();
  } catch (error) {
    return error as { digest?: string };
  }
  return undefined;
};
const search = (params: Record<string, string> = {}) => Promise.resolve(params);

beforeEach(() => {
  getSession.mockReset().mockResolvedValue(null);
  listAccounts.mockReset().mockResolvedValue(page([summary('u1', ROLE_USER)]));
  getAccount.mockReset().mockResolvedValue(detail('u1', ROLE_USER));
});

describe('the accounts list', () => {
  it('is for those who may view accounts, and a page that is not there for anyone else', async () => {
    as('x', ROLE_USER);
    expect((await failure(() => AccountsPage({ searchParams: search() })))?.digest).toBe(
      'NEXT_HTTP_ERROR_FALLBACK;404',
    );
    getSession.mockResolvedValue(null);
    expect((await failure(() => AccountsPage({ searchParams: search() })))?.digest).toContain(
      '/sign-in',
    );
    expect(listAccounts).not.toHaveBeenCalled();
  });

  it('lists each account with its role and state, the name a link to the account', async () => {
    as('admin', ROLE_ADMIN);
    listAccounts.mockResolvedValue(
      page([
        summary('o1', ROLE_OWNER),
        summary('a1', ROLE_ADMIN),
        summary('u1', ROLE_USER, { deactivatedAt: Date.UTC(2026, 9, 2) }),
      ]),
    );
    const html = renderToStaticMarkup(await AccountsPage({ searchParams: search() }));
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    for (const id of ['o1', 'a1', 'u1']) {
      expect(html).toContain(`href="/console/accounts/${id}"`);
      expect(html).toContain(`${id}@sovereign.local`);
    }
    expect(html).toContain('Owner');
    expect(html).toContain('Admin');
    expect(html).toContain('User');
    expect(html).toContain('Active');
    expect(html).toContain('Deactivated');
    expect(html).toContain('3 accounts');
    expect(html).toContain('1 Oct 2026');
  });

  it('asks for what was searched for, trimmed and bounded, and says so', async () => {
    as('admin', ROLE_ADMIN);
    listAccounts.mockResolvedValue(page([summary('u1', ROLE_USER)]));
    const html = renderToStaticMarkup(
      await AccountsPage({ searchParams: search({ q: '  pat  ', page: '2' }) }),
    );
    expect(listAccounts).toHaveBeenCalledWith({}, { query: 'pat', page: 2 });
    expect(html).toContain('value="pat"');
    expect(html).toContain('matching “pat”');
    expect(html).toContain('href="/console/accounts"');
    await AccountsPage({ searchParams: search({ q: 'x'.repeat(500) }) });
    expect((listAccounts.mock.calls.at(-1)?.[1] as { query: string }).query).toHaveLength(100);
  });

  it('keeps what is typed out of the markup as markup', async () => {
    as('admin', ROLE_ADMIN);
    const html = renderToStaticMarkup(
      await AccountsPage({ searchParams: search({ q: '"><script>alert(1)</script>' }) }),
    );
    expect(html).not.toContain('<script>alert');
  });

  it('says there is no match, and how to look again, rather than showing an empty table', async () => {
    as('admin', ROLE_ADMIN);
    listAccounts.mockResolvedValue(page([], { total: 0 }));
    const html = renderToStaticMarkup(await AccountsPage({ searchParams: search({ q: 'zzz' }) }));
    expect(html).toContain('No account matches that');
    expect(html).not.toContain('<table');
  });

  it('shows the pages only when there is more than one', async () => {
    as('admin', ROLE_ADMIN);
    expect(renderToStaticMarkup(await AccountsPage({ searchParams: search() }))).not.toContain(
      'Pages of accounts',
    );
    listAccounts.mockResolvedValue(page([summary('u1', ROLE_USER)], { pages: 3, total: 60 }));
    expect(renderToStaticMarkup(await AccountsPage({ searchParams: search() }))).toContain(
      'Pages of accounts',
    );
  });

  it('is drawn with the design system and carries no inline styling or scripts of its own', async () => {
    as('admin', ROLE_ADMIN);
    expect(renderToStaticMarkup(await AccountsPage({ searchParams: search() }))).not.toMatch(
      /<script|<style|style="/,
    );
  });
});

describe('one account', () => {
  const show = async (id = 'u1') =>
    renderToStaticMarkup(await AccountPage({ params: Promise.resolve({ id }) }));

  it('is for those who may view accounts, and nobody else', async () => {
    as('x', ROLE_USER);
    expect((await failure(show))?.digest).toBe('NEXT_HTTP_ERROR_FALLBACK;404');
    expect(getAccount).not.toHaveBeenCalled();
  });

  it('says there is no such account for one that is not there', async () => {
    as('admin', ROLE_ADMIN);
    getAccount.mockResolvedValue(undefined);
    expect((await failure(show))?.digest).toBe('NEXT_HTTP_ERROR_FALLBACK;404');
  });

  it('gives its details, with the account ID and a way to copy it', async () => {
    as('admin', ROLE_ADMIN);
    getAccount.mockResolvedValue(
      detail('u1', ROLE_USER, {
        passkeys: 2,
        sessions: 3,
        twoFactorEnabled: true,
        timezone: 'Europe/Paris',
        locale: 'fr-FR',
      }),
    );
    const html = await show();
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    for (const text of [
      'Name of u1',
      'u1@sovereign.local',
      'Account ID',
      '3 devices',
      'Europe/Paris',
      'fr-FR',
      'Verified',
      '>On<',
    ]) {
      expect(html).toContain(text);
    }
    expect(html).toContain('>Copy<');
  });

  it('offers an admin the actions for an ordinary account, but not a role change', async () => {
    as('admin', ROLE_ADMIN);
    const html = await show();
    expect(html).toContain('Deactivate');
    expect(html).toContain('Delete account');
    expect(html).not.toContain('Change role');
  });

  it('offers the owner the role change as well, for an admin', async () => {
    as('owner', ROLE_OWNER);
    getAccount.mockResolvedValue(detail('a1', ROLE_ADMIN));
    const html = await show('a1');
    expect(html).toContain('Change role');
    expect(html).toContain('Deactivate');
  });

  it('offers a deactivated account its reactivation, and not its deactivation', async () => {
    as('admin', ROLE_ADMIN);
    getAccount.mockResolvedValue(detail('u1', ROLE_USER, { deactivatedAt: Date.UTC(2026, 9, 2) }));
    const html = await show();
    expect(html).toContain('Reactivate');
    expect(html).not.toContain('>Deactivate<');
    expect(html).toContain('Deactivated');
  });

  it('offers the reset of two-factor sign-in only where there is something to reset', async () => {
    as('admin', ROLE_ADMIN);
    expect(await show()).not.toContain('Reset two-factor sign-in');
    getAccount.mockResolvedValue(detail('u1', ROLE_USER, { twoFactorEnabled: true }));
    expect(await show()).toContain('Reset two-factor sign-in');
    getAccount.mockResolvedValue(detail('u1', ROLE_USER, { passkeys: 1 }));
    expect(await show()).toContain('Reset two-factor sign-in');
  });

  it('offers an admin nothing for another admin or the owner, and says why', async () => {
    as('admin', ROLE_ADMIN);
    for (const role of [ROLE_ADMIN, ROLE_OWNER]) {
      getAccount.mockResolvedValue(detail('other', role));
      const html = await show('other');
      expect(html).not.toContain('Deactivate');
      expect(html).not.toContain('Delete account');
      expect(html).not.toContain('Change role');
      expect(html).toContain('Only the owner can manage an operator account.');
    }
  });

  it('offers nobody the actions on themselves, and points to their own pages', async () => {
    as('owner', ROLE_OWNER);
    getAccount.mockResolvedValue(detail('owner', ROLE_OWNER));
    const html = await show('owner');
    expect(html).not.toContain('Deactivate');
    expect(html).not.toContain('Delete account');
    expect(html).toContain('This is your own account.');
  });

  it('never offers a role change for the owner’s account', async () => {
    as('owner', ROLE_OWNER);
    getAccount.mockResolvedValue(detail('o2', ROLE_OWNER));
    expect(await show('o2')).not.toContain('Change role');
  });

  it('is drawn with the design system and carries no inline styling or scripts of its own', async () => {
    as('admin', ROLE_ADMIN);
    expect(await show()).not.toMatch(/<script|<style|style="/);
  });
});
