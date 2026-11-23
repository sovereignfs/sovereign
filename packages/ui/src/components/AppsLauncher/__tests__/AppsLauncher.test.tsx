// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AppsLauncher, appsLauncherItems } from '../AppsLauncher';

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

describe('appsLauncherItems', () => {
  const apps = [
    {
      id: 'notes',
      name: 'Notes',
      icon: 'https://notes.sovereign.local/icon.png',
      launchUrl: 'https://notes.sovereign.local/',
    },
    { id: 'shopper', name: 'Shopper', icon: null, launchUrl: 'https://shopper.sovereign.local/' },
    { id: 'tusk', name: 'tusk', icon: null, launchUrl: 'https://tusk.sovereign.local/' },
  ];

  it('opens each app at its launch address, with its icon or its first letter, leaving out the app it is in', () => {
    const items = appsLauncherItems(apps, { current: 'shopper' });
    expect(items.map((item) => [item.key, item.label, item.href])).toEqual([
      ['notes', 'Notes', 'https://notes.sovereign.local/'],
      ['tusk', 'tusk', 'https://tusk.sovereign.local/'],
    ]);
    render(<>{items[0]?.icon}</>);
    expect(document.querySelector('img')?.getAttribute('src')).toBe(
      'https://notes.sovereign.local/icon.png',
    );
    expect(items[1]?.icon).toBe('T');
    expect(appsLauncherItems(apps)).toHaveLength(3);
  });
});
