// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { NavTabs, type NavTabItem } from '../NavTabs';

afterEach(cleanup);

const items: NavTabItem[] = [
  { label: 'Profile', href: '/account/profile', active: true },
  { label: 'Security', href: '/account/security' },
];

describe('NavTabs', () => {
  it('renders a link per item', () => {
    render(<NavTabs items={items} />);
    expect(screen.getByRole('link', { name: 'Profile' }).getAttribute('href')).toBe(
      '/account/profile',
    );
    expect(screen.getByRole('link', { name: 'Security' }).getAttribute('href')).toBe(
      '/account/security',
    );
  });

  it('marks the active item with aria-current', () => {
    render(<NavTabs items={items} />);
    expect(screen.getByRole('link', { name: 'Profile' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Security' }).getAttribute('aria-current')).toBeNull();
  });

  it('defaults the nav aria-label to "Page navigation"', () => {
    render(<NavTabs items={items} />);
    expect(screen.getByRole('navigation', { name: 'Page navigation' })).toBeDefined();
  });

  it('uses a custom aria-label when provided', () => {
    render(<NavTabs items={items} aria-label="Account sections" />);
    expect(screen.getByRole('navigation', { name: 'Account sections' })).toBeDefined();
  });

  it('uses renderLink when provided instead of a plain anchor', () => {
    render(
      <NavTabs
        items={items}
        renderLink={(_item, linkProps) => (
          <a href={linkProps.href} data-custom="true">
            {linkProps.children}
          </a>
        )}
      />,
    );
    expect(screen.getByRole('link', { name: 'Profile' }).getAttribute('data-custom')).toBe('true');
  });
});
