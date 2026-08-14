import { describe, expect, it } from 'vitest';
import { buildEntries } from '../SidebarControl';

const PLUGINS = [
  { id: 'tasks', name: 'Tasks' },
  { id: 'shopper', name: 'Shopper' },
  { id: 'wallet', name: 'Wallet' },
];

describe('buildEntries — sidebar plugin preference read behavior', () => {
  it('defaults every installed plugin to visible, in installed order, when nothing is saved', () => {
    expect(buildEntries(PLUGINS, null)).toEqual([
      { id: 'tasks', hidden: false },
      { id: 'shopper', hidden: false },
      { id: 'wallet', hidden: false },
    ]);
  });

  it('preserves the saved order and hidden state for installed plugins', () => {
    const saved = [
      { id: 'shopper', hidden: true },
      { id: 'tasks', hidden: false },
      { id: 'wallet', hidden: false },
    ];

    expect(buildEntries(PLUGINS, saved)).toEqual(saved);
  });

  it('drops saved entries for plugins that are no longer installed', () => {
    const saved = [
      { id: 'tasks', hidden: false },
      { id: 'uninstalled-plugin', hidden: false },
      { id: 'shopper', hidden: false },
      { id: 'wallet', hidden: true },
    ];

    expect(buildEntries(PLUGINS, saved)).toEqual([
      { id: 'tasks', hidden: false },
      { id: 'shopper', hidden: false },
      { id: 'wallet', hidden: true },
    ]);
  });

  it('appends a newly installed plugin not yet in the saved list, visible by default', () => {
    const saved = [
      { id: 'tasks', hidden: false },
      { id: 'wallet', hidden: true },
    ];

    expect(buildEntries(PLUGINS, saved)).toEqual([
      { id: 'tasks', hidden: false },
      { id: 'wallet', hidden: true },
      { id: 'shopper', hidden: false },
    ]);
  });

  it('returns an empty list when no plugins are installed, regardless of saved state', () => {
    expect(buildEntries([], [{ id: 'tasks', hidden: false }])).toEqual([]);
  });
});
