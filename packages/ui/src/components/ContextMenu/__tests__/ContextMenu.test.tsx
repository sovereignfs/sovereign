// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, fireEvent } from '@testing-library/react';
import { ContextMenu } from '../ContextMenu';

let isMobileMatches = false;

function installMatchMedia() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: isMobileMatches,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

const items = [{ label: 'Delete', onSelect: vi.fn() }];

describe('ContextMenu', () => {
  beforeEach(() => {
    isMobileMatches = false;
    installMatchMedia();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  it('does not show the menu before any trigger', () => {
    render(
      <ContextMenu items={items} aria-label="Row actions">
        <div>Row</div>
      </ContextMenu>,
    );
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('opens on right-click (desktop) and prevents the native context menu', () => {
    render(
      <ContextMenu items={items} aria-label="Row actions">
        <div>Row</div>
      </ContextMenu>,
    );
    const target = screen.getByText('Row');
    const event = fireEvent.contextMenu(target, { clientX: 100, clientY: 150 });
    expect(event).toBe(false); // fireEvent returns false when preventDefault was called
    expect(screen.getByRole('menu')).toBeDefined();
  });

  it('selecting an item calls onSelect and closes the menu', () => {
    const onSelect = vi.fn();
    render(
      <ContextMenu items={[{ label: 'Delete', onSelect }]} aria-label="Row actions">
        <div>Row</div>
      </ContextMenu>,
    );
    fireEvent.contextMenu(screen.getByText('Row'), { clientX: 10, clientY: 10 });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(onSelect).toHaveBeenCalled();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('opens via long-press on touch instead of right-click', () => {
    vi.useFakeTimers();
    isMobileMatches = true;
    installMatchMedia();
    render(
      <ContextMenu items={items} aria-label="Row actions">
        <div>Row</div>
      </ContextMenu>,
    );
    const target = screen.getByText('Row');
    fireEvent.pointerDown(target, { pointerType: 'touch', clientX: 10, clientY: 10 });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(screen.getByRole('menu')).toBeDefined();
    vi.useRealTimers();
  });
});
