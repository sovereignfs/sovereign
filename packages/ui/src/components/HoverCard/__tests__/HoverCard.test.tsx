// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, fireEvent } from '@testing-library/react';
import { HoverCard } from '../HoverCard';

let matches = true;

function installMatchMedia() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

describe('HoverCard', () => {
  beforeEach(() => {
    matches = true; // hover-capable by default
    installMatchMedia();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    cleanup();
  });

  it('does not open immediately on mouse enter (hover-intent delay)', () => {
    render(
      <HoverCard trigger={<button type="button">Profile</button>} aria-label="Profile preview">
        Card content
      </HoverCard>,
    );
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Profile' }));
    expect(screen.queryByText('Card content')).toBeNull();
  });

  it('opens after the hover-intent delay elapses', () => {
    render(
      <HoverCard trigger={<button type="button">Profile</button>} aria-label="Profile preview">
        Card content
      </HoverCard>,
    );
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Profile' }));
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByText('Card content')).toBeDefined();
  });

  it('cancels the open timer if the pointer leaves before the delay elapses', () => {
    render(
      <HoverCard trigger={<button type="button">Profile</button>} aria-label="Profile preview">
        Card content
      </HoverCard>,
    );
    const trigger = screen.getByRole('button', { name: 'Profile' });
    fireEvent.mouseEnter(trigger);
    fireEvent.mouseLeave(trigger);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryByText('Card content')).toBeNull();
  });

  it('opens immediately on keyboard focus, for keyboard accessibility', () => {
    render(
      <HoverCard trigger={<button type="button">Profile</button>} aria-label="Profile preview">
        Card content
      </HoverCard>,
    );
    fireEvent.focus(screen.getByRole('button', { name: 'Profile' }));
    expect(screen.getByText('Card content')).toBeDefined();
  });

  it('falls back to tap-to-toggle when the pointer cannot hover', () => {
    matches = false;
    installMatchMedia();
    render(
      <HoverCard trigger={<button type="button">Profile</button>} aria-label="Profile preview">
        Card content
      </HoverCard>,
    );
    const trigger = screen.getByRole('button', { name: 'Profile' });
    fireEvent.click(trigger);
    expect(screen.getByText('Card content')).toBeDefined();
    fireEvent.click(trigger);
    expect(screen.queryByText('Card content')).toBeNull();
  });
});
