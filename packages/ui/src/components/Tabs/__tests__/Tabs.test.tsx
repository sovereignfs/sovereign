// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { Tabs } from '../Tabs';

afterEach(cleanup);

const items = [
  { label: 'Overview', value: 'overview' },
  { label: 'Users', value: 'users' },
  { label: 'Plugins', value: 'plugins' },
];

describe('Tabs', () => {
  it('renders all items as tab buttons', () => {
    render(<Tabs items={items} value="overview" onChange={() => {}} aria-label="Console" />);
    expect(screen.getAllByRole('tab').length).toBe(3);
  });

  it('marks the active tab as selected', () => {
    render(<Tabs items={items} value="users" onChange={() => {}} aria-label="Console" />);
    expect(screen.getByRole('tab', { name: 'Users' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: 'Overview' }).getAttribute('aria-selected')).toBe(
      'false',
    );
  });

  it('applies active class to the selected tab', () => {
    render(<Tabs items={items} value="plugins" onChange={() => {}} aria-label="Console" />);
    expect(screen.getByRole('tab', { name: 'Plugins' }).className).toContain('active');
    expect(screen.getByRole('tab', { name: 'Overview' }).className).toContain('inactive');
  });

  it('calls onChange with the clicked tab value', () => {
    const onChange = vi.fn();
    render(<Tabs items={items} value="overview" onChange={onChange} aria-label="Console" />);
    fireEvent.click(screen.getByRole('tab', { name: 'Users' }));
    expect(onChange).toHaveBeenCalledWith('users');
  });

  it('exposes a tablist with the given aria-label', () => {
    render(<Tabs items={items} value="overview" onChange={() => {}} aria-label="Nav" />);
    expect(screen.getByRole('tablist', { name: 'Nav' })).toBeDefined();
  });
});
