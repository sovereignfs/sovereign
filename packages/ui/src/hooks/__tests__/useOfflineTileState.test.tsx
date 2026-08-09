// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { useOfflineTileState } from '../useOfflineTileState';

function Harness({
  offline,
  deviceOnlyAvailable,
}: {
  offline: 'offline-first' | 'device-only' | undefined;
  deviceOnlyAvailable: boolean;
}) {
  const state = useOfflineTileState(offline, deviceOnlyAvailable);
  return <span data-testid="out">{String(state)}</span>;
}

describe('useOfflineTileState', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', { ...window.navigator, onLine: true });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  it('is null for a no-tier app while online', () => {
    const { getByTestId } = render(<Harness offline={undefined} deviceOnlyAvailable={false} />);
    expect(getByTestId('out').textContent).toBe('null');
  });

  it('connectivity-dims a no-tier app while offline', () => {
    vi.stubGlobal('navigator', { ...window.navigator, onLine: false });
    const { getByTestId } = render(<Harness offline={undefined} deviceOnlyAvailable={false} />);
    expect(getByTestId('out').textContent).toBe('connectivity-dimmed');
  });

  it('never dims an offline-first app, online or offline', () => {
    const online = render(<Harness offline="offline-first" deviceOnlyAvailable={false} />);
    expect(online.getByTestId('out').textContent).toBe('null');
    cleanup();

    vi.stubGlobal('navigator', { ...window.navigator, onLine: false });
    const offline = render(<Harness offline="offline-first" deviceOnlyAvailable={false} />);
    expect(offline.getByTestId('out').textContent).toBe('null');
  });

  it('capability-restricts a device-only app when unavailable, regardless of connectivity', () => {
    const online = render(<Harness offline="device-only" deviceOnlyAvailable={false} />);
    expect(online.getByTestId('out').textContent).toBe('capability-restricted');
    cleanup();

    vi.stubGlobal('navigator', { ...window.navigator, onLine: false });
    const offline = render(<Harness offline="device-only" deviceOnlyAvailable={false} />);
    expect(offline.getByTestId('out').textContent).toBe('capability-restricted');
  });

  it('is not restricted for a device-only app when available, and not dimmed offline either', () => {
    const online = render(<Harness offline="device-only" deviceOnlyAvailable={true} />);
    expect(online.getByTestId('out').textContent).toBe('null');
    cleanup();

    // Availability is a capability signal, not a connectivity one — a
    // device-only app that IS available behaves like offline-first once the
    // capability question is settled.
    vi.stubGlobal('navigator', { ...window.navigator, onLine: false });
    const offline = render(<Harness offline="device-only" deviceOnlyAvailable={true} />);
    expect(offline.getByTestId('out').textContent).toBe('null');
  });
});
