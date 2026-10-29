// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ROLE_ADMIN, ROLE_OWNER, ROLE_USER } from '../auth/roles';
import { DEFAULT_MATRIX } from '../roles/capabilities';

const getSession = vi.fn();
vi.mock('../auth/session', () => ({ getSession: () => getSession() as unknown }));
vi.mock('../auth/client', () => ({ authClient: { signOut: vi.fn() } }));
const matrix = vi.fn();
vi.mock('../roles/matrix', () => ({ getCapabilityMatrix: () => matrix() as unknown }));
const identity = vi.fn();
vi.mock('../instance/service', () => ({ getInstanceIdentity: () => identity() as unknown }));
// The logo reads the database; what it draws is tested with it (instance-identity.test.tsx).
vi.mock('../../app/instance-logo', () => ({ InstanceLogo: () => null }));
const pathname = vi.fn();
vi.mock('next/navigation', () => ({ usePathname: () => pathname() as string }));
vi.mock('next/link', () => ({
  default: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a>,
}));

const { AccountHeader } = await import('../../app/account-header');

const as = (role: unknown) =>
  getSession.mockResolvedValue({ user: { id: 'u1', name: 'Ada', email: 'ada@example.com', role } });
const draw = async (options: { bordered?: boolean } = {}) => render(await AccountHeader(options));
const hrefs = () => screen.getAllByRole('link').map((link) => link.getAttribute('href'));

beforeEach(() => {
  getSession.mockReset();
  matrix.mockReset().mockResolvedValue(DEFAULT_MATRIX);
  pathname.mockReset().mockReturnValue('/');
  identity.mockReset().mockResolvedValue({ name: 'Acme' });
});
afterEach(cleanup);

describe('the header every signed-in page has', () => {
  it('names the instance, and the name leads home', async () => {
    as(ROLE_USER);
    await draw();
    const brand = screen.getByRole('link', { name: 'Acme' });
    expect(brand.getAttribute('href')).toBe('/');
  });

  it('leads to the apps and the account, and to the Console only for an operator', async () => {
    as(ROLE_USER);
    await draw();
    expect(hrefs()).toEqual(['/', '/', '/profile']);
    cleanup();
    as(ROLE_ADMIN);
    await draw();
    expect(hrefs()).toEqual(['/', '/', '/profile', '/console']);
    cleanup();
    as(ROLE_OWNER);
    await draw();
    expect(hrefs()).toContain('/console');
  });

  it('judges the Console by the matrix in force, not by the role’s name', async () => {
    as(ROLE_ADMIN);
    matrix.mockResolvedValue({
      [ROLE_ADMIN]: new Set(['profile:manage', 'launcher:access']),
      [ROLE_USER]: new Set(['profile:manage', 'launcher:access']),
    });
    await draw();
    expect(hrefs()).not.toContain('/console');
  });

  it('marks where the person is, whichever page of that part they are on', async () => {
    as(ROLE_OWNER);
    for (const [path, current] of [
      ['/', 'Apps'],
      ['/security/passkeys', 'Account'],
      ['/connected-apps', 'Account'],
      ['/console/accounts/abc', 'Console'],
    ] as const) {
      pathname.mockReturnValue(path);
      await draw();
      const marked = screen
        .getAllByRole('link')
        .filter((link) => link.getAttribute('aria-current') === 'page')
        .map((link) => link.textContent);
      expect(marked, path).toEqual([current]);
      cleanup();
    }
  });

  it('offers to sign out', async () => {
    as(ROLE_USER);
    await draw();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeDefined();
  });

  it('draws nothing for someone who is not signed in', async () => {
    getSession.mockResolvedValue(null);
    expect(await AccountHeader({})).toBeNull();
  });
});
