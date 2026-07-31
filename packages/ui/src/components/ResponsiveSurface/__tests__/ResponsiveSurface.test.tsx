// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { ResponsiveSurface } from '../ResponsiveSurface';

let changeHandler: ((e: MediaQueryListEvent) => void) | null = null;
let matches = false;

function installMatchMedia() {
  changeHandler = null;
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => {
        changeHandler = cb;
      },
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

describe('ResponsiveSurface', () => {
  beforeEach(() => {
    matches = false;
    installMatchMedia();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  it('renders the web tree by default and never mounts the mobile tree', () => {
    render(
      <ResponsiveSurface
        web={<div data-testid="web">web</div>}
        mobile={<div data-testid="mobile">mobile</div>}
      />,
    );
    expect(screen.getByTestId('web')).toBeDefined();
    expect(screen.queryByTestId('mobile')).toBeNull();
  });

  it('renders only the mobile tree below the breakpoint', () => {
    matches = true;
    installMatchMedia();
    render(
      <ResponsiveSurface
        web={<div data-testid="web">web</div>}
        mobile={<div data-testid="mobile">mobile</div>}
      />,
    );
    expect(screen.getByTestId('mobile')).toBeDefined();
    expect(screen.queryByTestId('web')).toBeNull();
  });

  it('swaps trees live when the viewport crosses the breakpoint', () => {
    render(
      <ResponsiveSurface
        web={<div data-testid="web">web</div>}
        mobile={<div data-testid="mobile">mobile</div>}
      />,
    );
    expect(screen.getByTestId('web')).toBeDefined();
    act(() => changeHandler?.({ matches: true } as MediaQueryListEvent));
    expect(screen.getByTestId('mobile')).toBeDefined();
    expect(screen.queryByTestId('web')).toBeNull();
  });
});
