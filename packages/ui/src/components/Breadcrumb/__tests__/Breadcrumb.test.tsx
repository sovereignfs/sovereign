// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Breadcrumb } from '../Breadcrumb';

afterEach(cleanup);

const items = [
  { label: 'Console', href: '/console' },
  { label: 'Plugins', href: '/console/plugins' },
  { label: 'sovereign-tasks' },
];

describe('Breadcrumb', () => {
  it('renders a link for every item with an href', () => {
    render(<Breadcrumb items={items} />);
    expect(screen.getByRole('link', { name: 'Console' })).toHaveProperty(
      'href',
      expect.stringContaining('/console'),
    );
    expect(screen.getByRole('link', { name: 'Plugins' })).toBeDefined();
  });

  it('renders the item without href as plain text with aria-current', () => {
    render(<Breadcrumb items={items} />);
    expect(screen.queryByRole('link', { name: 'sovereign-tasks' })).toBeNull();
    expect(screen.getByText('sovereign-tasks').getAttribute('aria-current')).toBe('page');
  });

  it('uses a caller-supplied renderLink instead of a plain <a> when given', () => {
    render(
      <Breadcrumb
        items={items}
        renderLink={(item, children) => (
          <button type="button" data-href={item.href}>
            {children}
          </button>
        )}
      />,
    );
    expect(screen.queryByRole('link', { name: 'Console' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Console' })).toHaveProperty(
      'dataset.href',
      '/console',
    );
  });

  it('defaults to an accessible nav label', () => {
    render(<Breadcrumb items={items} />);
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeDefined();
  });
});
