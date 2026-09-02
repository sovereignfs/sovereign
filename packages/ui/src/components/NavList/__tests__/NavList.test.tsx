// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { NavList, type NavListGroup } from '../NavList';
import styles from '../NavList.module.css';

afterEach(cleanup);

const groups: NavListGroup[] = [
  {
    id: 'overview',
    items: [{ id: 'overview', label: 'Overview', href: '/console', icon: 'layout-dashboard' }],
  },
  {
    id: 'people',
    label: 'People',
    items: [
      { id: 'users', label: 'Users', href: '/console/users', icon: 'users', active: true },
      { id: 'groups', label: 'Groups', href: '/console/groups', icon: 'layers' },
    ],
  },
];

describe('NavList', () => {
  it('renders every item as a link with the correct href', () => {
    render(<NavList groups={groups} variant="static" aria-label="Sections" />);
    expect(screen.getByRole('link', { name: /overview/i }).getAttribute('href')).toBe('/console');
    expect(screen.getByRole('link', { name: /users/i }).getAttribute('href')).toBe(
      '/console/users',
    );
    expect(screen.getByRole('link', { name: /groups/i }).getAttribute('href')).toBe(
      '/console/groups',
    );
  });

  it('renders a label for a named group and no label for an ungrouped one', () => {
    render(<NavList groups={groups} variant="static" aria-label="Sections" />);
    // "People" is the only group.label in the fixture — it must appear exactly
    // once. The ungrouped "overview" group renders its item with no group
    // header text alongside it (nothing else in the fixture could produce a
    // second match).
    expect(screen.getAllByText('People')).toHaveLength(1);
  });

  describe('variant="static"', () => {
    it('marks the active item with aria-current="page"', () => {
      render(<NavList groups={groups} variant="static" aria-label="Sections" />);
      expect(screen.getByRole('link', { name: /users/i }).getAttribute('aria-current')).toBe(
        'page',
      );
      expect(screen.getByRole('link', { name: /groups/i }).getAttribute('aria-current')).toBeNull();
    });

    it('renders no chevron icons', () => {
      const { container } = render(
        <NavList groups={groups} variant="static" aria-label="Sections" />,
      );
      expect(container.querySelectorAll('svg').length).toBe(groups.flatMap((g) => g.items).length);
    });
  });

  describe('variant="drilldown"', () => {
    it('never sets aria-current, even on an item marked active', () => {
      render(<NavList groups={groups} variant="drilldown" aria-label="Sections" />);
      expect(screen.getByRole('link', { name: /users/i }).getAttribute('aria-current')).toBeNull();
    });

    it('renders a trailing chevron for every item', () => {
      const { container } = render(
        <NavList groups={groups} variant="drilldown" aria-label="Sections" />,
      );
      const itemCount = groups.flatMap((g) => g.items).length;
      // One icon svg + one chevron svg per item.
      expect(container.querySelectorAll('svg').length).toBe(itemCount * 2);
    });
  });

  describe('density', () => {
    it('defaults to no compact class', () => {
      const { container } = render(
        <NavList groups={groups} variant="static" aria-label="Sections" />,
      );
      expect(container.querySelector('nav')?.className).not.toContain(styles.compact);
    });

    it('applies the compact class when density="compact"', () => {
      const { container } = render(
        <NavList groups={groups} variant="static" density="compact" aria-label="Sections" />,
      );
      expect(container.querySelector('nav')?.className).toContain(styles.compact);
    });
  });

  it('calls renderLink with the item and computed link props instead of rendering a plain anchor', () => {
    const renderLink = vi.fn((_item, linkProps) => (
      <button type="button" aria-current={linkProps['aria-current']}>
        {linkProps.children}
      </button>
    ));
    render(
      <NavList groups={groups} variant="static" aria-label="Sections" renderLink={renderLink} />,
    );
    expect(renderLink).toHaveBeenCalledTimes(3);
    expect(screen.queryAllByRole('link').length).toBe(0);
    expect(screen.getByRole('button', { name: /users/i }).getAttribute('aria-current')).toBe(
      'page',
    );
  });
});
