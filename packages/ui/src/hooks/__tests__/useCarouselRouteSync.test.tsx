// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { useCarouselRouteSync } from '../useCarouselRouteSync';

const SLIDES = ['/a', '/b', '/c'];
function indexForPathname(pathname: string) {
  const i = SLIDES.indexOf(pathname);
  return i === -1 ? 0 : i;
}
function pathForIndex(index: number) {
  return SLIDES[index] ?? '/a';
}

function Harness({
  pathname,
  onNavigate,
  onResult,
}: {
  pathname: string;
  onNavigate: (path: string) => void;
  onResult: (result: { activeIndex: number; onSettle: (i: number) => void }) => void;
}) {
  const result = useCarouselRouteSync({ indexForPathname, pathForIndex, pathname, onNavigate });
  onResult(result);
  return <span data-testid="active">{result.activeIndex}</span>;
}

afterEach(cleanup);

describe('useCarouselRouteSync', () => {
  it('initializes activeIndex from the current pathname', () => {
    const onNavigate = vi.fn();
    const { getByTestId } = render(
      <Harness pathname="/b" onNavigate={onNavigate} onResult={() => {}} />,
    );
    expect(getByTestId('active').textContent).toBe('1');
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('an external pathname change (tapped Link, browser back/forward) updates activeIndex without calling onNavigate', () => {
    const onNavigate = vi.fn();
    const { getByTestId, rerender } = render(
      <Harness pathname="/a" onNavigate={onNavigate} onResult={() => {}} />,
    );
    expect(getByTestId('active').textContent).toBe('0');

    rerender(<Harness pathname="/c" onNavigate={onNavigate} onResult={() => {}} />);
    expect(getByTestId('active').textContent).toBe('2');
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("onSettle calls onNavigate with pathForIndex's output and updates activeIndex synchronously", () => {
    const onNavigate = vi.fn();
    let latest: { activeIndex: number; onSettle: (i: number) => void } = {
      activeIndex: -1,
      onSettle: () => {},
    };
    const { getByTestId } = render(
      <Harness
        pathname="/a"
        onNavigate={onNavigate}
        onResult={(r) => {
          latest = r;
        }}
      />,
    );

    act(() => void latest.onSettle(2));

    expect(getByTestId('active').textContent).toBe('2');
    expect(onNavigate).toHaveBeenCalledWith('/c');
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it('does NOT re-trigger the external-nav branch on the pathname-effect run that follows its own onSettle-driven navigation', () => {
    // This is the isInternalNav dance: onSettle navigates via onNavigate; the
    // caller's router then re-renders this hook with the new pathname — that
    // pathname change must be recognized as "our own settle, already
    // applied" and NOT reprocessed as an external nav. Both existing plugins'
    // code comments describe a real double-flicker bug from getting this
    // wrong, so this is the highest-value assertion in this file.
    const onNavigate = vi.fn();
    let latest: { activeIndex: number; onSettle: (i: number) => void } = {
      activeIndex: -1,
      onSettle: () => {},
    };
    const { getByTestId, rerender } = render(
      <Harness
        pathname="/a"
        onNavigate={onNavigate}
        onResult={(r) => {
          latest = r;
        }}
      />,
    );

    // Settle on /b (index 1) — this is the carousel's own gesture-driven navigation.
    act(() => void latest.onSettle(1));
    expect(getByTestId('active').textContent).toBe('1');
    expect(onNavigate).toHaveBeenCalledWith('/b');

    // The caller's router "commits" the navigation by re-rendering with the
    // new pathname (exactly what onNavigate's real router.replace would
    // eventually cause). If this were misidentified as an external nav, the
    // effect would recompute indexForPathname('/b') anyway — same value, so
    // a bug here wouldn't show up as a *wrong* index, only as an extra,
    // redundant setState (the actual symptom in the original bug was a
    // visible re-snap/flicker, not a wrong end state) — so this test also
    // asserts onNavigate is never called a second time as a side effect of
    // that re-render, which would happen if the effect treated it as new
    // settle-worthy input rather than a no-op resync.
    rerender(<Harness pathname="/b" onNavigate={onNavigate} onResult={(r) => (latest = r)} />);

    expect(getByTestId('active').textContent).toBe('1');
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it('an unrecognized pathname falls back to index 0', () => {
    const onNavigate = vi.fn();
    const { getByTestId } = render(
      <Harness pathname="/unknown" onNavigate={onNavigate} onResult={() => {}} />,
    );
    expect(getByTestId('active').textContent).toBe('0');
  });
});
