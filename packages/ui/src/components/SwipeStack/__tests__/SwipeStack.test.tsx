// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { SwipeStack } from '../SwipeStack';
import { SwipeStackCard } from '../SwipeStackCard';
import { SWIPE_STACK_TRANSITION_MS } from '../../../hooks/useSwipeStack';

// jsdom doesn't implement pointer capture — stub it as a no-op so
// `e.currentTarget.setPointerCapture(...)` doesn't throw.
beforeEach(() => {
  if (!HTMLElement.prototype.setPointerCapture) {
    HTMLElement.prototype.setPointerCapture = vi.fn();
  }
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function pointer(x: number, y: number) {
  return { clientX: x, clientY: y, pointerId: 1 };
}

function renderStack(onSwipe = vi.fn()) {
  const utils = render(
    <SwipeStack
      aria-label="Today's agenda"
      directions={{
        up: { label: 'Done', icon: 'check' },
        down: { label: 'Defer', icon: 'history' },
      }}
      onSwipe={onSwipe}
    >
      <SwipeStackCard cardId="a">Card A</SwipeStackCard>
      <SwipeStackCard cardId="b">Card B</SwipeStackCard>
      <SwipeStackCard cardId="c">Card C</SwipeStackCard>
    </SwipeStack>,
  );
  return { ...utils, onSwipe };
}

describe('SwipeStack', () => {
  it('renders the topmost card', () => {
    const { getByText, queryByText } = renderStack();
    expect(getByText('Card A')).toBeDefined();
    expect(queryByText('Card C')).toBeNull();
  });

  it('labels the swipeable region', () => {
    const { getByRole } = renderStack();
    expect(getByRole('region', { name: "Today's agenda" })).toBeDefined();
  });

  it('only renders a fallback button for configured directions', () => {
    const { getByRole, queryByRole } = renderStack();
    expect(getByRole('button', { name: 'Done' })).toBeDefined();
    expect(getByRole('button', { name: 'Defer' })).toBeDefined();
    expect(queryByRole('button', { name: 'Skip' })).toBeNull();
  });

  it('calls onSwipe with the direction and cardId when a drag crosses threshold', () => {
    const { getByText, onSwipe } = renderStack();
    const card = getByText('Card A');
    fireEvent.pointerDown(card, pointer(0, 0));
    fireEvent.pointerMove(card, pointer(0, -200));
    fireEvent.pointerUp(card, pointer(0, -200));
    expect(onSwipe).toHaveBeenCalledWith('up', 'a');
  });

  it('does not call onSwipe when dragging toward a direction that is not configured', () => {
    const { getByText, onSwipe } = renderStack();
    const card = getByText('Card A');
    fireEvent.pointerDown(card, pointer(0, 0));
    fireEvent.pointerMove(card, pointer(200, 0));
    fireEvent.pointerUp(card, pointer(200, 0));
    expect(onSwipe).not.toHaveBeenCalled();
  });

  it('calls onSwipe when a fallback button is clicked, without any drag', () => {
    const { getByRole, onSwipe } = renderStack();
    fireEvent.click(getByRole('button', { name: 'Defer' }));
    expect(onSwipe).toHaveBeenCalledWith('down', 'a');
  });

  it('advances to the next card only after the exit animation completes', () => {
    vi.useFakeTimers();
    const { getByRole, getByText, queryByText } = renderStack();
    expect(getByText('Card A')).toBeDefined();

    fireEvent.click(getByRole('button', { name: 'Done' }));
    // Still mid-animation — the committed card stays put (so the fling-out
    // it already started doesn't get cut off by a remount) and is still the
    // one the fallback buttons act on; Card B is already visible as the
    // peek behind it, but only decoratively (aria-hidden, not interactive).
    expect(getByText('Card A')).toBeDefined();
    const peekedB = getByText('Card B');
    expect(peekedB.closest('[aria-hidden="true"]')).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(SWIPE_STACK_TRANSITION_MS);
    });
    expect(queryByText('Card A')).toBeNull();
    expect(getByText('Card B').closest('[aria-hidden="true"]')).toBeNull();
  });

  it('never shows a dismissed card again, even if the caller still passes it as a child', () => {
    vi.useFakeTimers();
    const onSwipe = vi.fn();
    const directions = { up: { label: 'Done', icon: 'check' as const } };
    const { getByRole, getByText, queryByText, rerender } = render(
      <SwipeStack aria-label="Today's agenda" directions={directions} onSwipe={onSwipe}>
        <SwipeStackCard cardId="a">Card A</SwipeStackCard>
        <SwipeStackCard cardId="b">Card B</SwipeStackCard>
      </SwipeStack>,
    );
    fireEvent.click(getByRole('button', { name: 'Done' }));
    act(() => {
      vi.advanceTimersByTime(SWIPE_STACK_TRANSITION_MS);
    });
    expect(getByText('Card B')).toBeDefined();

    // Re-render with the exact same children — a caller slow to remove the
    // dismissed card from its own data. SwipeStack must not show it again.
    rerender(
      <SwipeStack aria-label="Today's agenda" directions={directions} onSwipe={onSwipe}>
        <SwipeStackCard cardId="a">Card A</SwipeStackCard>
        <SwipeStackCard cardId="b">Card B</SwipeStackCard>
      </SwipeStack>,
    );
    expect(queryByText('Card A')).toBeNull();
    expect(getByText('Card B')).toBeDefined();
  });
});

describe('SwipeStack dev-mode child-type guard', () => {
  function renderWithStrayChild() {
    return render(
      <SwipeStack aria-label="Today's agenda" directions={{}} onSwipe={() => {}}>
        <SwipeStackCard cardId="a">Card A</SwipeStackCard>
        {/* stray non-SwipeStackCard child */}
        <div>oops</div>
      </SwipeStack>,
    );
  }

  it('warns via console.error in development, mentioning the offending child', () => {
    const originalEnv = process.env.NODE_ENV;
    vi.stubEnv('NODE_ENV', 'development');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => renderWithStrayChild()).not.toThrow();

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('<div>'));
    vi.stubEnv('NODE_ENV', originalEnv ?? 'test');
  });

  it('does not call console.error in production', () => {
    const originalEnv = process.env.NODE_ENV;
    vi.stubEnv('NODE_ENV', 'production');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => renderWithStrayChild()).not.toThrow();

    expect(errorSpy).not.toHaveBeenCalled();
    vi.stubEnv('NODE_ENV', originalEnv ?? 'test');
  });
});
