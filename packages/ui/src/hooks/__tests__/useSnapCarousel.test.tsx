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
    setLayout(el, 300, 300);
    fireEvent.scroll(el);
    act(() => void vi.advanceTimersByTime(120));
    fireEvent.scroll(el);
    act(() => void vi.advanceTimersByTime(120));
    expect(onSettle).toHaveBeenCalledOnce();
  });

  it('clamps the settled index within [0, itemCount - 1]', () => {
    const onSettle = vi.fn();
    const { getByTestId } = render(<Harness itemCount={2} onSettle={onSettle} debounceMs={120} />);
    const el = getByTestId('scroller');
    setLayout(el, 300, 900); // rounds to index 3, clamps to itemCount - 1 = 1
    fireEvent.scroll(el);
    act(() => void vi.advanceTimersByTime(120));
    expect(onSettle).toHaveBeenCalledWith(1);
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
