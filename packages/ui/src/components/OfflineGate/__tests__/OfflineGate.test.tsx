// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { OfflineGate } from '../OfflineGate';

describe('OfflineGate', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', { ...window.navigator, onLine: true });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  it('renders children unchanged while online', () => {
    render(
      <OfflineGate>
        <p>Live content</p>
      </OfflineGate>,
    );
    expect(screen.getByText('Live content')).toBeDefined();
  });

  it('replaces children with an explanatory empty state while offline', () => {
    vi.stubGlobal('navigator', { ...window.navigator, onLine: false });
    render(
      <OfflineGate>
        <p>Live content</p>
      </OfflineGate>,
    );
    expect(screen.queryByText('Live content')).toBeNull();
    expect(screen.getByText("You're offline")).toBeDefined();
  });

  it('names the surface in the offline message when provided', () => {
    vi.stubGlobal('navigator', { ...window.navigator, onLine: false });
    render(
      <OfflineGate surfaceName="Console">
        <p>Live content</p>
      </OfflineGate>,
    );
    expect(screen.getByText(/Console needs a connection/)).toBeDefined();
  });

  it('falls back to generic phrasing with no surface name', () => {
    vi.stubGlobal('navigator', { ...window.navigator, onLine: false });
    render(
      <OfflineGate>
        <p>Live content</p>
      </OfflineGate>,
    );
    expect(screen.getByText(/This section needs a connection/)).toBeDefined();
  });

  it('swaps back to children on reconnect', () => {
    vi.stubGlobal('navigator', { ...window.navigator, onLine: false });
    render(
      <OfflineGate>
        <p>Live content</p>
      </OfflineGate>,
    );
    expect(screen.getByText("You're offline")).toBeDefined();
    act(() => window.dispatchEvent(new Event('online')));
    expect(screen.getByText('Live content')).toBeDefined();
  });
});
