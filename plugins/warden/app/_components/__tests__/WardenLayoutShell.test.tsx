// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { WardenLayoutShell, useWardenShell } from '../WardenLayoutShell';
import { LEGACY_SIDEBAR_STORAGE_KEY, SIDEBAR_COOKIE_NAME } from '../../_lib/sidebar-preference';

function cookieValue(): string | undefined {
  return document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SIDEBAR_COOKIE_NAME}=`))
    ?.slice(SIDEBAR_COOKIE_NAME.length + 1);
}

function clearCookie() {
  document.cookie = `${SIDEBAR_COOKIE_NAME}=; Path=/warden; Max-Age=0`;
  document.cookie = `${SIDEBAR_COOKIE_NAME}=; Max-Age=0`;
}

/**
 * Stands in for `WardenSidebar`, which is the real consumer of the collapse
 * toggle `WardenLayoutShell` exposes through `useWardenShell()` — this
 * fixture renders a button for it the same way `WardenSidebar` renders its
 * own collapse button when rendered inside the shell.
 */
function TestSidebar() {
  const shell = useWardenShell();
  return (
    <nav>
      Sidebar content
      {shell && <button onClick={shell.toggleCollapse}>Collapse from sidebar</button>}
    </nav>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  clearCookie();
  // jsdom's location is `http://localhost/`, whose path is not `/warden`, so
  // a `Path=/warden` cookie would never be sent back — write with the
  // document's own path instead so the round trip can be observed.
  window.history.replaceState(null, '', '/warden');
});

afterEach(() => {
  cleanup();
});

function renderShell(initialCollapsed?: boolean) {
  return render(
    <WardenLayoutShell sidebar={<TestSidebar />} initialCollapsed={initialCollapsed}>
      <p>Main content</p>
    </WardenLayoutShell>,
  );
}

describe('WardenLayoutShell', () => {
  /**
   * The sidebar column stays mounted when collapsed (hiding it by swapping
   * the surrounding tree used to remount the whole chat column — see the
   * no-remount tests below), so "hidden" is asserted through the
   * accessibility tree rather than raw DOM presence: `ThreeColumnLayout`
   * sets the native `hidden` attribute, which `getByRole` honours and
   * `getByText` does not.
   */
  const querySidebar = () => screen.queryByRole('navigation');

  it('hides the sidebar by default, showing only the main-column toggle', () => {
    renderShell();
    expect(querySidebar()).toBeNull();
    expect(screen.getByText('Main content')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Show sessions sidebar' })).toBeDefined();
  });

  it('reveals the sidebar on toggle, moving the collapse control onto the sidebar itself', () => {
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'Show sessions sidebar' }));

    expect(querySidebar()).not.toBeNull();
    expect(screen.getByText('Main content')).toBeDefined();
    // The main column no longer carries its own toggle once the sidebar has one.
    expect(screen.queryByRole('button', { name: 'Show sessions sidebar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Hide sessions sidebar' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Collapse from sidebar' })).toBeDefined();
  });

  it('persists the expanded state to the preference cookie', () => {
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'Show sessions sidebar' }));
    expect(cookieValue()).toBe('0');
  });

  it('renders expanded on the first paint when the server read the cookie', () => {
    // No effect-driven flip: the server layout hands the stored preference in,
    // so a user who keeps the sidebar open never sees the full-width flash.
    renderShell(false);
    expect(querySidebar()).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Show sessions sidebar' })).toBeNull();
  });

  it('migrates a legacy localStorage preference into the cookie once', () => {
    window.localStorage.setItem(LEGACY_SIDEBAR_STORAGE_KEY, '0');
    renderShell(true);
    expect(querySidebar()).not.toBeNull();
    expect(cookieValue()).toBe('0');
    expect(window.localStorage.getItem(LEGACY_SIDEBAR_STORAGE_KEY)).toBeNull();
  });

  it('collapsing from within the sidebar hides it again and restores the main-column toggle', () => {
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'Show sessions sidebar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Collapse from sidebar' }));

    expect(querySidebar()).toBeNull();
    expect(cookieValue()).toBe('1');
    expect(screen.getByRole('button', { name: 'Show sessions sidebar' })).toBeDefined();
  });

  it('surfaces New chat beside the toggle only while the sidebar is hidden', () => {
    renderShell();
    // Collapsed: the sidebar's own "New chat" row is gone, so the shell
    // offers one.
    expect(screen.getByRole('link', { name: 'New chat' }).getAttribute('href')).toBe('/warden/new');

    fireEvent.click(screen.getByRole('button', { name: 'Show sessions sidebar' }));
    // Expanded: the sidebar has it again, so the shell's copy stands down
    // rather than showing the same action twice.
    expect(screen.queryByRole('link', { name: 'New chat' })).toBeNull();
  });

  /**
   * The regression these two guard: the shell used to return a structurally
   * different tree per state, so `children` changed parent element type on
   * every toggle and React unmounted its entire subtree — silently
   * discarding an in-flight stream, unsent composer text, and any
   * incognito conversation (memory-only, so unrecoverable).
   */
  it('keeps the same DOM node for its children across a collapse toggle', () => {
    renderShell();
    const before = screen.getByText('Main content');

    fireEvent.click(screen.getByRole('button', { name: 'Show sessions sidebar' }));
    expect(screen.getByText('Main content')).toBe(before);

    fireEvent.click(screen.getByRole('button', { name: 'Collapse from sidebar' }));
    expect(screen.getByText('Main content')).toBe(before);
  });

  it('preserves child component state across a collapse toggle', () => {
    function Counter() {
      const [count, setCount] = useState(0);
      return (
        <button type="button" onClick={() => setCount((c) => c + 1)}>
          count: {count}
        </button>
      );
    }

    render(
      <WardenLayoutShell sidebar={<TestSidebar />}>
        <Counter />
      </WardenLayoutShell>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'count: 0' }));
    expect(screen.getByRole('button', { name: 'count: 1' })).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Show sessions sidebar' }));
    // Would read "count: 0" again if the toggle remounted the subtree.
    expect(screen.getByRole('button', { name: 'count: 1' })).toBeDefined();
  });
});
