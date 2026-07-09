// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { MOBILE_BREAKPOINT_PX, useIsMobile } from '../useIsMobile';

// Capture the registered change listener so a test can drive a viewport change.
let changeHandler: ((e: MediaQueryListEvent) => void) | null = null;
let matches = false;
let lastQuery = '';

function installMatchMedia() {
  changeHandler = null;
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => {
      lastQuery = query;
      return {
        matches,
        media: query,
        addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => {
          changeHandler = cb;
        },
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      };
    }),
  );
}

function Harness({ breakpoint }: { breakpoint?: number }) {
  const isMobile = useIsMobile(breakpoint);
  return <span data-testid="out">{String(isMobile)}</span>;
}

describe('useIsMobile', () => {
  beforeEach(() => {
    matches = false;
    installMatchMedia();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  it('exports the canonical 768px breakpoint', () => {
    expect(MOBILE_BREAKPOINT_PX).toBe(768);
  });

  it('defaults to the canonical breakpoint in its query', () => {
    matches = true;
    installMatchMedia();
    render(<Harness />);
    expect(lastQuery).toBe('(max-width: 768px)');
  });

  it('reflects the initial matchMedia result after mount', () => {
    matches = true;
    installMatchMedia();
    const { getByTestId } = render(<Harness />);
    expect(getByTestId('out').textContent).toBe('true');
  });

  it('updates when the viewport crosses the breakpoint', () => {
    matches = false;
    installMatchMedia();
    const { getByTestId } = render(<Harness />);
    expect(getByTestId('out').textContent).toBe('false');
    act(() => changeHandler?.({ matches: true } as MediaQueryListEvent));
    expect(getByTestId('out').textContent).toBe('true');
  });

  it('honours a custom breakpoint override', () => {
    matches = false;
    installMatchMedia();
    render(<Harness breakpoint={640} />);
    expect(lastQuery).toBe('(max-width: 640px)');
  });
});
