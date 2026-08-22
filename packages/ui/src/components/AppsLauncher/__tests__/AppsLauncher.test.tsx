// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AppsLauncher } from '../AppsLauncher';

afterEach(() => {
  cleanup();
});

const items = [
  { key: 'home', icon: <span>home-icon</span>, label: 'Home', href: '/launcher' },
  { key: 'notes', icon: <span>notes-icon</span>, label: 'Notes', onClick: vi.fn() },
];

describe('AppsLauncher', () => {
  it('renders a closed trigger by default', () => {
    render(<AppsLauncher items={items} />);
    expect(screen.getByRole('button', { name: 'Apps' })).toBeTruthy();
    expect(screen.queryByText('Home')).toBeNull();
  });

  it('opens the tile grid on trigger click', () => {
    render(<AppsLauncher items={items} />);
    fireEvent.click(screen.getByRole('button', { name: 'Apps' }));
    expect(screen.getByText('Home')).toBeTruthy();
    expect(screen.getByText('Notes')).toBeTruthy();
  });

  it('renders an href item as a link and an onClick item as a button', () => {
    render(<AppsLauncher items={items} />);
    fireEvent.click(screen.getByRole('button', { name: 'Apps' }));
    expect(screen.getByText('Home').closest('a')).toHaveProperty(
      'href',
      expect.stringContaining('/launcher'),
    );
    expect(screen.getByText('Notes').closest('button')).toBeTruthy();
  });

  it('shows a loading state instead of the grid', () => {
    render(<AppsLauncher items={items} loading />);
    fireEvent.click(screen.getByRole('button', { name: 'Apps' }));
    expect(screen.queryByText('Home')).toBeNull();
    expect(screen.getByRole('status', { name: /Loading apps/ })).toBeTruthy();
  });

  it('shows an error state instead of the grid', () => {
    render(<AppsLauncher items={items} error errorMessage="Nope" />);
    fireEvent.click(screen.getByRole('button', { name: 'Apps' }));
    expect(screen.queryByText('Home')).toBeNull();
    expect(screen.getByText('Nope')).toBeTruthy();
  });
});
