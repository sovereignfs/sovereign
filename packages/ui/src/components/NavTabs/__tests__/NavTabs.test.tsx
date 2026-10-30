// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { NavTabs } from '../NavTabs';

afterEach(cleanup);

const ITEMS = [
  { label: 'Profile', href: '/profile', active: true },
  { label: 'Security', href: '/security' },
];

describe('NavTabs', () => {
  it('is a navigation landmark, with a name for a page of tabs', () => {
    render(<NavTabs items={ITEMS} />);
    expect(screen.getByRole('navigation', { name: 'Page navigation' })).toBeDefined();
    cleanup();
    render(<NavTabs items={ITEMS} aria-label="Account" />);
    expect(screen.getByRole('navigation', { name: 'Account' })).toBeDefined();
  });

  it('links each tab, and marks the current page for assistive technology', () => {
    render(<NavTabs items={ITEMS} />);
    const profile = screen.getByRole('link', { name: 'Profile' });
    const security = screen.getByRole('link', { name: 'Security' });
    expect(profile.getAttribute('href')).toBe('/profile');
    expect(profile.getAttribute('aria-current')).toBe('page');
    expect(profile.className).toContain('active');
    expect(security.getAttribute('aria-current')).toBeNull();
    expect(security.className).not.toContain('active');
  });

  it('lets the app draw the links, with the props they need', () => {
    render(
      <NavTabs
        items={ITEMS}
        renderLink={(item, props) => (
          <a data-router="yes" data-label={item.label} {...props}>
            {props.children}
          </a>
        )}
      />,
    );
    const profile = screen.getByRole('link', { name: 'Profile' });
    expect(profile.getAttribute('data-router')).toBe('yes');
    expect(profile.getAttribute('aria-current')).toBe('page');
    expect(profile.getAttribute('href')).toBe('/profile');
  });

  it('takes the caller’s class', () => {
    render(<NavTabs items={ITEMS} className="mine" />);
    expect(screen.getByRole('navigation').className).toContain('mine');
  });
});
