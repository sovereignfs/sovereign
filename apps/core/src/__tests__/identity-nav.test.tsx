// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

let pathname = '/profile';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));
vi.mock('next/link', () => ({
  default: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a>,
}));

const { IdentityNav } = await import('../../app/identity-nav');

afterEach(cleanup);

describe('the identity pages navigation', () => {
  it('links the pages that exist, and no others', () => {
    render(<IdentityNav />);
    expect(screen.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([
      '/profile',
      '/security',
      '/preferences',
      '/connected-apps',
    ]);
  });

  it.each([
    ['/profile', 'Profile'],
    ['/security', 'Security'],
    ['/security/passkeys', 'Security'],
    ['/security/two-factor', 'Security'],
    ['/preferences', 'Preferences'],
    ['/connected-apps', 'Connected apps'],
  ])('marks the current page on %s as %s', (path, label) => {
    pathname = path;
    render(<IdentityNav />);
    const current = screen
      .getAllByRole('link')
      .filter((link) => link.getAttribute('aria-current') === 'page');
    expect(current.map((link) => link.textContent)).toEqual([label]);
  });

  it('does not mark a page whose name only starts the same way', () => {
    pathname = '/securityx';
    render(<IdentityNav />);
    expect(
      screen.getAllByRole('link').some((link) => link.getAttribute('aria-current') === 'page'),
    ).toBe(false);
  });
});
