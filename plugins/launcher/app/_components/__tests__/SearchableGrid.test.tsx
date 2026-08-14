// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SearchableGrid } from '../SearchableGrid';
import type { PluginTileData } from '../PluginTile';

vi.mock('@sovereignfs/sdk/device-client', () => ({
  isDeviceOnlyTierAvailable: () => false,
}));
vi.mock('@sovereignfs/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sovereignfs/ui')>();
  return { ...actual, useOfflineTileState: () => 'normal' };
});

afterEach(() => cleanup());

const PLUGINS: PluginTileData[] = [
  { id: 'tasks', name: 'Tasks', description: 'A simple to-do list.', routePrefix: '/tasks' },
  {
    id: 'shopper',
    name: 'Shopper',
    description: 'A shared grocery list.',
    routePrefix: '/shopper',
  },
  {
    id: 'wallet',
    name: 'Wallet',
    description: 'Passes and loyalty cards, offline-first.',
    routePrefix: '/wallet',
  },
];

describe('SearchableGrid — plugin filtering behavior', () => {
  it('shows every installed plugin when the search field is empty', () => {
    render(<SearchableGrid plugins={PLUGINS} total={PLUGINS.length} />);

    expect(screen.getByText('Tasks')).toBeDefined();
    expect(screen.getByText('Shopper')).toBeDefined();
    expect(screen.getByText('Wallet')).toBeDefined();
    expect(screen.getByText('3 installed')).toBeDefined();
  });

  it('filters by name, case-insensitively', () => {
    render(<SearchableGrid plugins={PLUGINS} total={PLUGINS.length} />);

    fireEvent.change(screen.getByPlaceholderText('Search apps'), { target: { value: 'SHOP' } });

    expect(screen.getByText('Shopper')).toBeDefined();
    expect(screen.queryByText('Tasks')).toBeNull();
    expect(screen.queryByText('Wallet')).toBeNull();
  });

  it('filters by description text, not just name', () => {
    render(<SearchableGrid plugins={PLUGINS} total={PLUGINS.length} />);

    fireEvent.change(screen.getByPlaceholderText('Search apps'), {
      target: { value: 'loyalty' },
    });

    expect(screen.getByText('Wallet')).toBeDefined();
    expect(screen.queryByText('Tasks')).toBeNull();
  });

  it('shows an empty state naming the query when nothing matches', () => {
    render(<SearchableGrid plugins={PLUGINS} total={PLUGINS.length} />);

    fireEvent.change(screen.getByPlaceholderText('Search apps'), {
      target: { value: 'nonexistent-app' },
    });

    expect(screen.getByText('No apps match "nonexistent-app"')).toBeDefined();
  });

  it('ignores leading/trailing whitespace in the query', () => {
    render(<SearchableGrid plugins={PLUGINS} total={PLUGINS.length} />);

    fireEvent.change(screen.getByPlaceholderText('Search apps'), {
      target: { value: '  tasks  ' },
    });

    expect(screen.getByText('Tasks')).toBeDefined();
  });
});
