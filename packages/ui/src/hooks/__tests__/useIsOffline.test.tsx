// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { useIsOffline } from '../useIsOffline';

function Harness() {
  const isOffline = useIsOffline();
  return <span data-testid="out">{String(isOffline)}</span>;
}

describe('useIsOffline', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', { ...window.navigator, onLine: true });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  it('reflects navigator.onLine after mount', () => {
    vi.stubGlobal('navigator', { ...window.navigator, onLine: false });
    const { getByTestId } = render(<Harness />);
    expect(getByTestId('out').textContent).toBe('true');
  });

  it('does not report offline when navigator.onLine is true', () => {
    const { getByTestId } = render(<Harness />);
    expect(getByTestId('out').textContent).toBe('false');
  });

  it('flips on the offline event', () => {
    const { getByTestId } = render(<Harness />);
    expect(getByTestId('out').textContent).toBe('false');
    act(() => window.dispatchEvent(new Event('offline')));
    expect(getByTestId('out').textContent).toBe('true');
  });

  it('flips back on the online event', () => {
    vi.stubGlobal('navigator', { ...window.navigator, onLine: false });
    const { getByTestId } = render(<Harness />);
    expect(getByTestId('out').textContent).toBe('true');
    act(() => window.dispatchEvent(new Event('online')));
    expect(getByTestId('out').textContent).toBe('false');
  });

  it('removes its listeners on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = render(<Harness />);
    unmount();
    expect(removeSpy).toHaveBeenCalledWith('offline', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('online', expect.any(Function));
  });
});
