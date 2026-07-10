// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { useMountTransition, usePrefersReducedMotion } from '../motion';

let matches = false;
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

function MountTransitionHarness({ open, durationMs }: { open: boolean; durationMs: number }) {
  const { mounted, phase } = useMountTransition(open, durationMs);
  return <span data-testid="out">{mounted ? phase : 'unmounted'}</span>;
}

describe('useMountTransition', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('animates the entrance even on a fresh mount that starts open (e.g. a route-driven overlay)', () => {
    const { getByTestId } = render(<MountTransitionHarness open durationMs={250} />);
    // Renders 'entering' first — the closed-position styles — so the CSS
    // transition has somewhere to animate from; the effect below flips it to
    // 'open' one frame later, same as a prop-driven open transition would.
    expect(getByTestId('out').textContent).toBe('entering');
    act(() => void vi.advanceTimersByTime(16)); // flush the requestAnimationFrame callback
    expect(getByTestId('out').textContent).toBe('open');
  });

  it('starts unmounted when closed from the first render', () => {
    const { getByTestId } = render(<MountTransitionHarness open={false} durationMs={250} />);
    expect(getByTestId('out').textContent).toBe('unmounted');
  });

  it('animates entrance: entering on the same frame, open one frame later', () => {
    const { getByTestId, rerender } = render(
      <MountTransitionHarness open={false} durationMs={250} />,
    );
    rerender(<MountTransitionHarness open durationMs={250} />);
    expect(getByTestId('out').textContent).toBe('entering');
    act(() => {
      vi.advanceTimersByTime(16); // flush the requestAnimationFrame callback
    });
    expect(getByTestId('out').textContent).toBe('open');
  });

  it('stays mounted through "closing" for durationMs, then unmounts', () => {
    const { getByTestId, rerender } = render(<MountTransitionHarness open durationMs={250} />);
    rerender(<MountTransitionHarness open={false} durationMs={250} />);
    // Still mounted immediately after `open` flips false — this is the whole
    // point: the exit transition needs to actually play, not jump-cut.
    expect(getByTestId('out').textContent).toBe('closing');
    act(() => void vi.advanceTimersByTime(249));
    expect(getByTestId('out').textContent).toBe('closing');
    act(() => void vi.advanceTimersByTime(1));
    expect(getByTestId('out').textContent).toBe('unmounted');
  });

  it('honours a near-zero durationMs (the reduced-motion path)', () => {
    const { getByTestId, rerender } = render(<MountTransitionHarness open durationMs={0} />);
    rerender(<MountTransitionHarness open={false} durationMs={0} />);
    act(() => void vi.advanceTimersByTime(0));
    expect(getByTestId('out').textContent).toBe('unmounted');
  });
});

function ReducedMotionHarness() {
  const reduced = usePrefersReducedMotion();
  return <span data-testid="out">{String(reduced)}</span>;
}

describe('usePrefersReducedMotion', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  it('defaults to false and reflects a true matchMedia result after mount', () => {
    matches = true;
    installMatchMedia();
    const { getByTestId } = render(<ReducedMotionHarness />);
    expect(getByTestId('out').textContent).toBe('true');
  });

  it('reflects a false matchMedia result', () => {
    matches = false;
    installMatchMedia();
    const { getByTestId } = render(<ReducedMotionHarness />);
    expect(getByTestId('out').textContent).toBe('false');
  });
});
