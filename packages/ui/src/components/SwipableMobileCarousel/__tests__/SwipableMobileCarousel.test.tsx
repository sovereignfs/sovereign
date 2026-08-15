// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SwipableMobileCarousel } from '../SwipableMobileCarousel';
import { SwipableMobileCarouselSlide } from '../SwipableMobileCarouselSlide';
import { SwipableMobileCarouselSlideHeader } from '../SwipableMobileCarouselSlideHeader';
import { SwipableMobileCarouselSlideBody } from '../SwipableMobileCarouselSlideBody';

// Same jsdom scroll polyfill/fake-timer setup as useSnapCarousel.test.tsx,
// since this component wraps that hook directly.
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

const KEYS = ['a', 'b', 'c', 'd', 'e'];

function FiveSlides({
  activeIndex,
  onSettle,
}: {
  activeIndex: number;
  onSettle: (i: number) => void;
}) {
  return (
    <SwipableMobileCarousel activeIndex={activeIndex} onSettle={onSettle} aria-label="Test slides">
      {KEYS.map((key) => (
        <SwipableMobileCarouselSlide key={key} slideKey={key} label={key}>
          <SwipableMobileCarouselSlideHeader>{`header-${key}`}</SwipableMobileCarouselSlideHeader>
          <SwipableMobileCarouselSlideBody>{`body-${key}`}</SwipableMobileCarouselSlideBody>
        </SwipableMobileCarouselSlide>
      ))}
    </SwipableMobileCarousel>
  );
}

describe('SwipableMobileCarousel', () => {
  it('only mounts the active slide and its immediate neighbors (default prefetchDistance=1)', () => {
    render(<FiveSlides activeIndex={2} onSettle={() => {}} />);
    // active (c) and neighbors (b, d) are mounted
    expect(screen.getByText('header-b')).toBeDefined();
    expect(screen.getByText('header-c')).toBeDefined();
    expect(screen.getByText('header-d')).toBeDefined();
    // out-of-window slides (a, e) render nothing at all
    expect(screen.queryByText('header-a')).toBeNull();
    expect(screen.queryByText('body-a')).toBeNull();
    expect(screen.queryByText('header-e')).toBeNull();
    expect(screen.queryByText('body-e')).toBeNull();
  });

  it("SlideBody's loading prop only hides that region, not the Header", () => {
    render(
      <SwipableMobileCarousel activeIndex={0} onSettle={() => {}} aria-label="Test slides">
        <SwipableMobileCarouselSlide slideKey="only" label="Only">
          <SwipableMobileCarouselSlideHeader>the-title</SwipableMobileCarouselSlideHeader>
          <SwipableMobileCarouselSlideBody loading>tasks-content</SwipableMobileCarouselSlideBody>
        </SwipableMobileCarouselSlide>
      </SwipableMobileCarousel>,
    );
    expect(screen.getByText('the-title')).toBeDefined();
    expect(screen.queryByText('tasks-content')).toBeNull();
    expect(screen.getByText('Loading…')).toBeDefined();
  });

  it('calls onSettle with the new index after a swipe settles', () => {
    const onSettle = vi.fn();
    render(<FiveSlides activeIndex={0} onSettle={onSettle} />);
    const scroller = screen.getByRole('region', { name: 'Test slides' });
    fireEvent.touchStart(scroller);
    setLayout(scroller, 300, 300); // scrollLeft 300 / width 300 -> index 1
    fireEvent.scroll(scroller);
    act(() => void vi.advanceTimersByTime(120));
    expect(onSettle).toHaveBeenCalledWith(1);
  });

  it('clicking a dot calls onSettle directly with that index', () => {
    const onSettle = vi.fn();
    render(<FiveSlides activeIndex={0} onSettle={onSettle} />);
    const dots = screen.getAllByRole('tab');
    const fourthDot = dots[3];
    if (!fourthDot) throw new Error('expected a 4th dot');
    setLayout(screen.getByRole('region', { name: 'Test slides' }), 300, 0);
    fireEvent.click(fourthDot);
    expect(onSettle).toHaveBeenCalledWith(3);
  });

  it('positions both the default and a custom renderIndicator inside the same overlay slot', () => {
    // Regression test: the overlay-positioning class used to be applied
    // directly to the default SwipableMobileCarouselDots instance, so any
    // caller-supplied renderIndicator rendered as a plain static element
    // instead — pushed out of view below the full-height scroller. The
    // carousel must own positioning for whatever renderIndicator returns.
    const { unmount } = render(<FiveSlides activeIndex={0} onSettle={() => {}} />);
    const defaultTablist = screen.getByRole('tablist');
    expect(defaultTablist.parentElement?.className).toMatch(/indicatorSlot/);
    unmount();

    render(
      <SwipableMobileCarousel
        activeIndex={0}
        onSettle={() => {}}
        aria-label="Test slides"
        renderIndicator={({ count, activeIndex, onJump }) => (
          <div role="tablist" aria-label="Custom">
            {Array.from({ length: count }, (_, i) => (
              <button key={i} type="button" role="tab" onClick={() => onJump(i)}>
                {i === activeIndex ? 'active' : 'inactive'}
              </button>
            ))}
          </div>
        )}
      >
        {KEYS.map((key) => (
          <SwipableMobileCarouselSlide key={key} slideKey={key} label={key}>
            {`slide-${key}`}
          </SwipableMobileCarouselSlide>
        ))}
      </SwipableMobileCarousel>,
    );
    const customTablist = screen.getByRole('tablist', { name: 'Custom' });
    expect(customTablist.parentElement?.className).toMatch(/indicatorSlot/);
  });

  it('re-snaps and reports the new index when the active slide moves position (reorder-jump fix)', () => {
    function Reorderable({ order, onSettle }: { order: string[]; onSettle: (i: number) => void }) {
      return (
        <SwipableMobileCarousel activeIndex={1} onSettle={onSettle} aria-label="Test slides">
          {order.map((key) => (
            <SwipableMobileCarouselSlide key={key} slideKey={key} label={key}>
              <SwipableMobileCarouselSlideHeader>{`header-${key}`}</SwipableMobileCarouselSlideHeader>
            </SwipableMobileCarouselSlide>
          ))}
        </SwipableMobileCarousel>
      );
    }
    const onSettle = vi.fn();
    const { rerender } = render(<Reorderable order={['a', 'b', 'c']} onSettle={onSettle} />);
    const scroller = screen.getByRole('region', { name: 'Test slides' });
    setLayout(scroller, 300, 0);
    const spy = vi.spyOn(scroller, 'scrollTo');

    // 'b' (index 1, active) moves to index 0.
    rerender(<Reorderable order={['b', 'a', 'c']} onSettle={onSettle} />);

    expect(onSettle).toHaveBeenCalledWith(0);
    expect(spy).toHaveBeenCalledWith({ left: 0, behavior: 'instant' });
  });

  it('mounts a slide reached by a fast multi-slide flick before settle-detection reports it', () => {
    // Regression test, found via a user screen recording: a fast flick can
    // carry native scroll-snap momentum straight past an intermediate slide
    // to one two-or-more away in a single continuous gesture. Settle-
    // detection deliberately still waits out the full debounce window before
    // calling onSettle (to distinguish a real settle from drift — see
    // useSnapCarousel's chainTrustedRef comment), but the mount window used
    // to be keyed *only* off that settled index — so the slide the container
    // had already scrolled to, visually, sat completely unmounted (not even
    // a loading skeleton, per SwipableMobileCarouselSlide's `return null`)
    // for the entire debounce window. liveIndex closes that gap.
    const onSettle = vi.fn();
    const KEYS8 = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    function EightSlides({ onSettle }: { onSettle: (i: number) => void }) {
      return (
        <SwipableMobileCarousel activeIndex={0} onSettle={onSettle} aria-label="Test slides">
          {KEYS8.map((key) => (
            <SwipableMobileCarouselSlide key={key} slideKey={key} label={key}>
              <SwipableMobileCarouselSlideHeader>{`header-${key}`}</SwipableMobileCarouselSlideHeader>
            </SwipableMobileCarouselSlide>
          ))}
        </SwipableMobileCarousel>
      );
    }
    render(<EightSlides onSettle={onSettle} />);
    const scroller = screen.getByRole('region', { name: 'Test slides' });
    // Slide 'e' (index 4) is well outside the default prefetchDistance=1
    // window around the settled index 0.
    expect(screen.queryByText('header-e')).toBeNull();

    fireEvent.touchStart(scroller);
    setLayout(scroller, 300, 1200); // scrollLeft 1200 / width 300 -> index 4
    fireEvent.scroll(scroller);
    // Well short of the 120ms settle debounce — onSettle must not have fired
    // yet, but the rAF-throttled liveIndex update has had time to run.
    act(() => void vi.advanceTimersByTime(20));
    expect(onSettle).not.toHaveBeenCalled();
    expect(screen.getByText('header-e')).toBeDefined();

    act(() => void vi.advanceTimersByTime(120));
    expect(onSettle).toHaveBeenCalledWith(4);
  });

  it('does not re-snap when slide order is unchanged', () => {
    function Reorderable({ onSettle }: { onSettle: (i: number) => void }) {
      return <FiveSlides activeIndex={2} onSettle={onSettle} />;
    }
    const onSettle = vi.fn();
    const { rerender } = render(<Reorderable onSettle={onSettle} />);
    rerender(<Reorderable onSettle={onSettle} />);
    expect(onSettle).not.toHaveBeenCalled();
  });
});
