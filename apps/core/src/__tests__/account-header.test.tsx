// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ROLE_ADMIN, ROLE_OWNER, ROLE_USER } from '../auth/roles';
import { DEFAULT_MATRIX } from '../roles/capabilities';

const getSession = vi.fn();
vi.mock('../auth/session', () => ({ getSession: () => getSession() as unknown }));
const signOut = vi.fn();
vi.mock('../auth/client', () => ({ authClient: { signOut: () => signOut() as unknown } }));
const matrix = vi.fn();
vi.mock('../roles/matrix', () => ({ getCapabilityMatrix: () => matrix() as unknown }));
const identity = vi.fn();
vi.mock('../instance/service', () => ({ getInstanceIdentity: () => identity() as unknown }));
// The mark reads the instance; what it draws is tested with it (instance-identity.test.tsx).
vi.mock('../../app/brand-mark', () => ({ BrandMark: () => <span data-testid="mark" /> }));
vi.mock('next/link', () => ({
  default: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a>,
}));

const { AccountHeader } = await import('../../app/account-header');

const as = (role: unknown, extra: Record<string, unknown> = {}) =>
  getSession.mockResolvedValue({
    user: { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com', role, ...extra },
  });
const draw = async () => render(await AccountHeader({}));
const openMenu = () => fireEvent.click(screen.getByRole('button', { name: 'Your account' }));
const menuLinks = () =>
  screen
    .getAllByRole('menuitem')
    .map((item) => [item.textContent, item.getAttribute('href')] as const);

beforeEach(() => {
  getSession.mockReset();
  signOut.mockReset();
  matrix.mockReset().mockResolvedValue(DEFAULT_MATRIX);
  identity.mockReset().mockResolvedValue({ name: 'Acme' });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('the header every signed-in page has', () => {
  it('has the instance’s mark and name on the left, and both lead home', async () => {
    as(ROLE_USER);
    await draw();
    const brand = screen.getByRole('link', { name: 'Acme' });
    expect(brand.getAttribute('href')).toBe('/');
    expect(brand.querySelector('[data-testid="mark"]')).toBeTruthy();
  });

  it('has nothing else on the left, and the person’s avatar on the right, closed', async () => {
    as(ROLE_USER);
    await draw();
    expect(screen.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual(['/']);
    const avatar = screen.getByRole('button', { name: 'Your account' });
    expect(avatar.getAttribute('aria-expanded')).toBe('false');
    // Their initials, until they have a picture.
    expect(avatar.textContent).toBe('AL');
    expect(screen.queryByRole('menuitem')).toBeNull();
  });

  it('shows their picture when they have one', async () => {
    as(ROLE_USER, { image: '/api/avatars/u1?v=1' });
    await draw();
    expect(
      screen
        .getByRole('button', { name: 'Your account' })
        .querySelector('img')
        ?.getAttribute('src'),
    ).toBe('/api/avatars/u1?v=1');
  });

  it('opens a menu with who they are, their account and signing out, and no Console for an ordinary person', async () => {
    as(ROLE_USER);
    await draw();
    openMenu();
    expect(await screen.findByText('Ada Lovelace')).toBeTruthy();
    expect(screen.getByText('ada@example.com')).toBeTruthy();
    expect(menuLinks()).toEqual([
      ['Account', '/profile'],
      ['Sign out', null],
    ]);
  });

  it('adds the Console for an operator, between their account and signing out', async () => {
    for (const role of [ROLE_ADMIN, ROLE_OWNER]) {
      as(role);
      await draw();
      openMenu();
      expect(menuLinks().map(([label]) => label)).toEqual(['Account', 'Console', 'Sign out']);
      expect(menuLinks()[1]?.[1]).toBe('/console');
      cleanup();
    }
  });

  it('judges the Console by the matrix in force, not by the role’s name', async () => {
    as(ROLE_ADMIN);
    matrix.mockResolvedValue({
      [ROLE_ADMIN]: new Set(['profile:manage', 'launcher:access']),
      [ROLE_USER]: new Set(['profile:manage', 'launcher:access']),
    });
    await draw();
    openMenu();
    expect(menuLinks().map(([label]) => label)).toEqual(['Account', 'Sign out']);
  });

  it('ends the session, then goes to sign-in saying so, with a full navigation', async () => {
    as(ROLE_USER);
    signOut.mockResolvedValue({ data: { success: true }, error: null });
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    await draw();
    openMenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Sign out' }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/sign-in?signedout=1'));
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('draws nothing for someone who is not signed in', async () => {
    getSession.mockResolvedValue(null);
    expect(await AccountHeader({})).toBeNull();
  });
});
