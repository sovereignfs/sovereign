// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let pathname = '/console';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));
vi.mock('next/link', () => ({
  default: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a>,
}));

const { ConsoleShell } = await import('../../app/console/console-shell');

const sections = [
  { id: 'overview', label: 'Overview', href: '/console', icon: 'layout-dashboard' as const },
  { id: 'accounts', label: 'Accounts', href: '/console/accounts', icon: 'users' as const },
  {
    id: 'settings',
    label: 'Settings',
    href: '/console/settings',
    icon: 'settings' as const,
    group: 'Instance',
  },
];

function viewport(mobile: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: mobile && query.includes('max-width'),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

beforeEach(() => {
  pathname = '/console';
  viewport(false);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const hrefs = (nav: HTMLElement) =>
  within(nav)
    .getAllByRole('link')
    .map((link) => link.getAttribute('href'));

describe('the Console on a wide screen', () => {
  it('lists the sections it is given beside the page, and no others', () => {
    render(
      <ConsoleShell sections={sections}>
        <p>the page</p>
      </ConsoleShell>,
    );
    expect(hrefs(screen.getByRole('navigation', { name: 'Console sections' }))).toEqual([
      '/console',
      '/console/accounts',
      '/console/settings',
    ]);
    expect(screen.getByText('the page')).toBeTruthy();
  });

  it('lists nothing it was not given: an operator without a section never sees it named', () => {
    render(
      <ConsoleShell sections={[sections[0] as (typeof sections)[number]]}>
        <p>the page</p>
      </ConsoleShell>,
    );
    const nav = screen.getByRole('navigation', { name: 'Console sections' });
    expect(hrefs(nav)).toEqual(['/console']);
    expect(nav.textContent).not.toMatch(/Accounts|Settings/);
  });

  it.each([
    ['/console', 'Overview'],
    ['/console/accounts', 'Accounts'],
    ['/console/accounts/abc', 'Accounts'],
    ['/console/settings', 'Settings'],
  ])('marks %s as %s', (path, label) => {
    pathname = path;
    render(
      <ConsoleShell sections={sections}>
        <p>x</p>
      </ConsoleShell>,
    );
    const current = within(screen.getByRole('navigation', { name: 'Console sections' }))
      .getAllByRole('link')
      .filter((link) => link.getAttribute('aria-current') === 'page');
    expect(current.map((link) => link.textContent)).toEqual([label]);
  });

  it('puts a heading over the sections that have one', () => {
    render(
      <ConsoleShell sections={sections}>
        <p>x</p>
      </ConsoleShell>,
    );
    expect(screen.getByText('Instance')).toBeTruthy();
  });
});

describe('the Console on a phone', () => {
  beforeEach(() => viewport(true));

  it('starts with the page and an index of the other sections, with no way back to itself', async () => {
    render(
      <ConsoleShell sections={sections}>
        <p>the page</p>
      </ConsoleShell>,
    );
    const nav = await screen.findByRole('navigation', { name: 'Console sections' });
    expect(hrefs(nav)).toEqual(['/console/accounts', '/console/settings']);
    expect(screen.queryByRole('link', { name: 'Console' })).toBeNull();
  });

  it('gives every other page a way back to the Console, and no index of its own', async () => {
    pathname = '/console/accounts';
    render(
      <ConsoleShell sections={sections}>
        <p>the page</p>
      </ConsoleShell>,
    );
    expect((await screen.findByRole('link', { name: 'Console' })).getAttribute('href')).toBe(
      '/console',
    );
    expect(screen.queryByRole('navigation', { name: 'Console sections' })).toBeNull();
  });

  it('has no index at all when there is nothing but the Console’s own page', async () => {
    render(
      <ConsoleShell sections={[sections[0] as (typeof sections)[number]]}>
        <p>the page</p>
      </ConsoleShell>,
    );
    await screen.findByText('the page');
    expect(screen.queryByRole('navigation', { name: 'Console sections' })).toBeNull();
  });
});
