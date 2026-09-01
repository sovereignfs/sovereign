// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { WardenLayoutShell } from '../WardenLayoutShell';

const COLLAPSE_STORAGE_KEY = 'warden:sidebarCollapsed';

/**
 * Stands in for `WardenSidebar`, which is the real consumer of the
 * `onToggleCollapse` prop `WardenLayoutShell` injects via `cloneElement` —
 * a plain host element (e.g. a bare `<nav>`) can't render a button from a
 * prop it doesn't know about, so this fixture renders one itself, the same
 * way `WardenSidebar` renders its own collapse button when the prop is
 * present.
 */
function TestSidebar({ onToggleCollapse }: { onToggleCollapse?: () => void }) {
  return (
    <nav>
      Sidebar content
      {onToggleCollapse && <button onClick={onToggleCollapse}>Collapse from sidebar</button>}
    </nav>
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
});

function renderShell() {
  return render(
    <WardenLayoutShell sidebar={<TestSidebar />}>
      <p>Main content</p>
    </WardenLayoutShell>,
  );
}

describe('WardenLayoutShell', () => {
  it('hides the sidebar by default, showing only the main-column toggle', () => {
    renderShell();
    expect(screen.queryByText('Sidebar content')).toBeNull();
    expect(screen.getByText('Main content')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Show sessions sidebar' })).toBeDefined();
  });

  it('reveals the sidebar on toggle, moving the collapse control onto the sidebar itself', () => {
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'Show sessions sidebar' }));

    expect(screen.getByText('Sidebar content')).toBeDefined();
    expect(screen.getByText('Main content')).toBeDefined();
    // The main column no longer carries its own toggle once the sidebar has one.
    expect(screen.queryByRole('button', { name: 'Show sessions sidebar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Hide sessions sidebar' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Collapse from sidebar' })).toBeDefined();
  });

  it('persists the expanded state to localStorage and restores it on remount', () => {
    const { unmount } = renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'Show sessions sidebar' }));
    expect(window.localStorage.getItem(COLLAPSE_STORAGE_KEY)).toBe('0');
    unmount();

    renderShell();
    expect(screen.getByText('Sidebar content')).toBeDefined();
  });

  it('collapsing from within the sidebar hides it again and restores the main-column toggle', () => {
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'Show sessions sidebar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Collapse from sidebar' }));

    expect(screen.queryByText('Sidebar content')).toBeNull();
    expect(window.localStorage.getItem(COLLAPSE_STORAGE_KEY)).toBe('1');
    expect(screen.getByRole('button', { name: 'Show sessions sidebar' })).toBeDefined();
  });
});
