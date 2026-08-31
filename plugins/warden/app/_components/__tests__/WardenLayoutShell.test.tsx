// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { WardenLayoutShell } from '../WardenLayoutShell';

const COLLAPSE_STORAGE_KEY = 'warden:sidebarCollapsed';

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
});

function renderShell() {
  return render(
    <WardenLayoutShell sidebar={<nav>Sidebar content</nav>}>
      <p>Main content</p>
    </WardenLayoutShell>,
  );
}

describe('WardenLayoutShell', () => {
  it('renders both the sidebar and the main content by default', () => {
    renderShell();
    expect(screen.getByText('Sidebar content')).toBeDefined();
    expect(screen.getByText('Main content')).toBeDefined();
  });

  it('hides the sidebar (but keeps the toggle and main content) once collapsed', () => {
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'Hide sessions sidebar' }));
    expect(screen.queryByText('Sidebar content')).toBeNull();
    expect(screen.getByText('Main content')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Show sessions sidebar' })).toBeDefined();
  });

  it('persists the collapsed state to localStorage and restores it on remount', () => {
    const { unmount } = renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'Hide sessions sidebar' }));
    expect(window.localStorage.getItem(COLLAPSE_STORAGE_KEY)).toBe('1');
    unmount();

    renderShell();
    expect(screen.queryByText('Sidebar content')).toBeNull();
    expect(screen.getByRole('button', { name: 'Show sessions sidebar' })).toBeDefined();
  });

  it('toggling back on restores the sidebar and clears the stored flag', () => {
    window.localStorage.setItem(COLLAPSE_STORAGE_KEY, '1');
    renderShell();
    expect(screen.queryByText('Sidebar content')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Show sessions sidebar' }));
    expect(screen.getByText('Sidebar content')).toBeDefined();
    expect(window.localStorage.getItem(COLLAPSE_STORAGE_KEY)).toBe('0');
  });
});
