// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { useSnapCarousel, type UseSnapCarouselOptions } from '../useSnapCarousel';

// jsdom doesn't implement scrollTo on elements.
beforeEach(() => {
  vi.useFakeTimers();
  if (!Element.prototype.scrollTo) {
    Element.prototype.scrollTo = vi.fn();
  }
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  cleanup();
});

function setLayout(el: HTMLElement, clientWidth: number, scrollLeft: number) {
  Object.defineProperty(el, 'clientWidth', { value: clientWidth, configurable: true });
  Object.defineProperty(el, 'scrollLeft', { value: scrollLeft, configurable: true });
}

function Harness(
  props: UseSnapCarouselOptions & { onScrollTo?: (fn: (i: number) => void) => void },
) {
  const { onScrollTo, ...options } = props;
  const { scrollRef, scrollToIndex } = useSnapCarousel(options);
  onScrollTo?.(scrollToIndex);
  return <div data-testid="scroller" ref={scrollRef} />;
}

describe('useSnapCarousel', () => {
  it('calls onSettle with the new index after the debounce window', () => {
    const onSettle = vi.fn();
    const { getByTestId } = render(<Harness itemCount={3} onSettle={onSettle} debounceMs={120} />);
    const el = getByTestId('scroller');
    fireEvent.touchStart(el);
    setLayout(el, 300, 300); // scrollLeft 300 / width 300 -> index 1
    fireEvent.scroll(el);
    expect(onSettle).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(120));
    expect(onSettle).toHaveBeenCalledWith(1);
  });

  it('debounces repeated scroll events into a single settle call', () => {
    const onSettle = vi.fn();
    const { getByTestId } = render(<Harness itemCount={3} onSettle={onSettle} debounceMs={120} />);
    const el = getByTestId('scroller');
    fireEvent.touchStart(el);
    setLayout(el, 300, 0);
    fireEvent.scroll(el);
    act(() => void vi.advanceTimersByTime(60));
    setLayout(el, 300, 300);
    fireEvent.scroll(el);
    act(() => void vi.advanceTimersByTime(120));
    expect(onSettle).toHaveBeenCalledOnce();
    expect(onSettle).toHaveBeenCalledWith(1);
  });

  it('does not call onSettle again for the same index', () => {
    const onSettle = vi.fn();
    const { getByTestId } = render(<Harness itemCount={3} onSettle={onSettle} debounceMs={120} />);
    const el = getByTestId('scroller');
    fireEvent.touchStart(el);
    setLayout(el, 300, 300);
    fireEvent.scroll(el);
    act(() => void vi.advanceTimersByTime(120));
    fireEvent.touchStart(el);
    fireEvent.scroll(el);
    act(() => void vi.advanceTimersByTime(120));
    expect(onSettle).toHaveBeenCalledOnce();
  });

  it('clamps the settled index within [0, itemCount - 1]', () => {
    const onSettle = vi.fn();
    const { getByTestId } = render(<Harness itemCount={2} onSettle={onSettle} debounceMs={120} />);
    const el = getByTestId('scroller');
    fireEvent.touchStart(el);
    setLayout(el, 300, 900); // rounds to index 3, clamps to itemCount - 1 = 1
    fireEvent.scroll(el);
    act(() => void vi.advanceTimersByTime(120));
    expect(onSettle).toHaveBeenCalledWith(1);
  });

  it('ignores a scroll event with no active gesture (drift, not a settle)', () => {
    // Regression test: reproduced live via a user screen recording — a
    // slide's content changing size while still loading can nudge
    // scrollLeft enough to round to a different index. Previously any such
    // stray `scroll` event was enough to fire a second, contradicting
    // onSettle, silently "auto-swiping" the carousel back to the wrong
    // slide with no further touch input.
    const onSettle = vi.fn();
    const { getByTestId } = render(<Harness itemCount={10} onSettle={onSettle} debounceMs={120} />);
    const el = getByTestId('scroller');
    fireEvent.touchStart(el);
    setLayout(el, 300, 1800); // settles cleanly on index 6
    fireEvent.scroll(el);
    act(() => void vi.advanceTimersByTime(120));
    expect(onSettle).toHaveBeenCalledExactlyOnceWith(6);

    // Well outside the grace window and no further touch/wheel/pointer
    // activity — this scroll event is drift, not a resettle.
    act(() => void vi.advanceTimersByTime(1000));
    setLayout(el, 300, 1620); // would round to index 5
    fireEvent.scroll(el);
    act(() => void vi.advanceTimersByTime(120));
    expect(onSettle).toHaveBeenCalledExactlyOnceWith(6);
  });

  it('still settles on long-running momentum/snap-correction scroll with no further touch input', () => {
    // Regression test for a bug in the FIRST version of the drift fix above:
    // gating on "was there a touch/wheel/pointer event within a fixed
    // debounceMs * 2 slack of settle-check time" dropped real settles once
    // native momentum/snap-correction ran longer than that slack — which it
    // routinely does for a fast flick. That left activeIndex stuck on the
    // old slide while the container had already scrolled to the new one,
    // and since the mount window is keyed off activeIndex, the slide the
    // user was actually looking at could get unmounted — a blank carousel,
    // worse than the bug being fixed. The chain stays trusted for as long as
    // scroll events keep arriving without a debounceMs-or-longer gap,
    // regardless of how long that run lasts or how few touch events back it.
    const onSettle = vi.fn();
    const { getByTestId } = render(<Harness itemCount={10} onSettle={onSettle} debounceMs={120} />);
    const el = getByTestId('scroller');
    fireEvent.touchStart(el);
    setLayout(el, 300, 1700);
    fireEvent.scroll(el); // starts the run — trusted (touchstart just happened)
    fireEvent.touchEnd(el);
    // Momentum keeps producing scroll events, each within debounceMs of the
    // last (so the run never goes quiet), for far longer than any fixed
    // slack window would tolerate — no further touch input at all.
    for (const scrollLeft of [1720, 1740, 1760, 1780, 1800]) {
      act(() => void vi.advanceTimersByTime(80));
      setLayout(el, 300, scrollLeft);
      fireEvent.scroll(el);
    }
    act(() => void vi.advanceTimersByTime(120));
    expect(onSettle).toHaveBeenCalledExactlyOnceWith(6);
  });

  it('settles correctly on two independent real swipes fired back-to-back', () => {
    // Regression test: two genuine swipes with essentially no gap between
    // them (an impatient fast double-swipe) must not corrupt or drop either
    // settle — each is its own trusted run.
    const onSettle = vi.fn();
    const { getByTestId } = render(<Harness itemCount={10} onSettle={onSettle} debounceMs={120} />);
    const el = getByTestId('scroller');
    fireEvent.touchStart(el);
    setLayout(el, 300, 300);
    fireEvent.scroll(el);
    act(() => void vi.advanceTimersByTime(120));
    expect(onSettle).toHaveBeenCalledExactlyOnceWith(1);

    fireEvent.touchStart(el);
    setLayout(el, 300, 600);
    fireEvent.scroll(el);
    act(() => void vi.advanceTimersByTime(120));
    expect(onSettle).toHaveBeenCalledTimes(2);
    expect(onSettle).toHaveBeenLastCalledWith(2);
  });

  it('scrollToIndex scrolls the container to the target slide', () => {
    let scrollToIndex: ((index: number) => void) | undefined;
    const { getByTestId } = render(
      <Harness itemCount={3} onScrollTo={(fn) => (scrollToIndex = fn)} />,
    );
    const el = getByTestId('scroller');
    setLayout(el, 400, 0);
    const spy = vi.spyOn(el, 'scrollTo');
    scrollToIndex?.(2);
    expect(spy).toHaveBeenCalledWith({ left: 800, behavior: 'smooth' });
  });
});
