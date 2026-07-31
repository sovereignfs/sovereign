// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { useResponsiveLayout } from '../useResponsiveLayout';

// Same matchMedia mocking approach as useIsMobile.test.tsx, since this hook
// is a thin wrapper over it and must not diverge in SSR/breakpoint behavior.
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

function Harness({ breakpointPx }: { breakpointPx?: number }) {
  const { isMobile, value } = useResponsiveLayout({
    web: 'web-tree',
    mobile: 'mobile-tree',
    breakpointPx,
  });
  return (
    <span data-testid="out" data-is-mobile={String(isMobile)}>
      {value}
    </span>
  );
}

describe('useResponsiveLayout', () => {
  beforeEach(() => {
    matches = false;
    installMatchMedia();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  it('defaults to the web value before/without a mobile match (SSR-safe default)', () => {
    matches = false;
    installMatchMedia();
    const { getByTestId } = render(<Harness />);
    expect(getByTestId('out').textContent).toBe('web-tree');
    expect(getByTestId('out').dataset.isMobile).toBe('false');
  });

  it('picks the mobile value once matchMedia reports a match', () => {
    matches = true;
    installMatchMedia();
    const { getByTestId } = render(<Harness />);
    expect(getByTestId('out').textContent).toBe('mobile-tree');
    expect(getByTestId('out').dataset.isMobile).toBe('true');
  });

  it('swaps live when the viewport crosses the breakpoint', () => {
    matches = false;
    installMatchMedia();
    const { getByTestId } = render(<Harness />);
    expect(getByTestId('out').textContent).toBe('web-tree');
    act(() => changeHandler?.({ matches: true } as MediaQueryListEvent));
    expect(getByTestId('out').textContent).toBe('mobile-tree');
  });

  it('passes a custom breakpointPx straight through to useIsMobile', () => {
    matches = false;
    installMatchMedia();
    render(<Harness breakpointPx={640} />);
    expect(lastQuery).toBe('(max-width: 640px)');
  });
});
