// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { useSwipeReveal, type UseSwipeRevealOptions } from '../useSwipeReveal';

// jsdom doesn't implement pointer capture — stub it as a no-op so
// `e.currentTarget.setPointerCapture(...)` doesn't throw.
beforeEach(() => {
  if (!HTMLElement.prototype.setPointerCapture) {
    HTMLElement.prototype.setPointerCapture = vi.fn();
  }
});

afterEach(cleanup);

function Harness(props: UseSwipeRevealOptions) {
  const { rowRef, handlers } = useSwipeReveal(props);
  return (
    <div data-testid="row" ref={rowRef} {...handlers}>
      row
    </div>
  );
}

function pointer(x: number, y: number) {
  return { clientX: x, clientY: y, pointerId: 1 };
}

describe('useSwipeReveal', () => {
  it('calls onOpen when a horizontal drag crosses the halfway point', () => {
    const onOpen = vi.fn();
    const onClose = vi.fn();
    const { getByTestId } = render(
      <Harness revealWidth={100} open={false} onOpen={onOpen} onClose={onClose} />,
    );
    const el = getByTestId('row');
    fireEvent.pointerDown(el, pointer(0, 0));
    fireEvent.pointerMove(el, pointer(-60, 0));
    fireEvent.pointerUp(el, pointer(-60, 0));
    expect(onOpen).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose when the drag does not cross the halfway point', () => {
    const onOpen = vi.fn();
    const onClose = vi.fn();
    const { getByTestId } = render(
      <Harness revealWidth={100} open={false} onOpen={onOpen} onClose={onClose} />,
    );
    const el = getByTestId('row');
    fireEvent.pointerDown(el, pointer(0, 0));
    fireEvent.pointerMove(el, pointer(-20, 0));
    fireEvent.pointerUp(el, pointer(-20, 0));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('locks to vertical and ignores a mostly-vertical drag', () => {
    const onOpen = vi.fn();
    const onClose = vi.fn();
    const { getByTestId } = render(
      <Harness revealWidth={100} open={false} onOpen={onOpen} onClose={onClose} />,
    );
    const el = getByTestId('row');
    fireEvent.pointerDown(el, pointer(0, 0));
    fireEvent.pointerMove(el, pointer(2, 60));
    fireEvent.pointerUp(el, pointer(2, 60));
    expect(onOpen).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does nothing when disabled', () => {
    const onOpen = vi.fn();
    const onClose = vi.fn();
    const { getByTestId } = render(
      <Harness revealWidth={100} open={false} onOpen={onOpen} onClose={onClose} disabled />,
    );
    const el = getByTestId('row');
    fireEvent.pointerDown(el, pointer(0, 0));
    fireEvent.pointerMove(el, pointer(-60, 0));
    fireEvent.pointerUp(el, pointer(-60, 0));
    expect(onOpen).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes from an already-open state when dragged back past halfway', () => {
    const onOpen = vi.fn();
    const onClose = vi.fn();
    const { getByTestId } = render(
      <Harness revealWidth={100} open onOpen={onOpen} onClose={onClose} />,
    );
    const el = getByTestId('row');
    fireEvent.pointerDown(el, pointer(0, 0));
    fireEvent.pointerMove(el, pointer(60, 0));
    fireEvent.pointerUp(el, pointer(60, 0));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('ignores pointerup without a preceding pointerdown', () => {
    const onOpen = vi.fn();
    const onClose = vi.fn();
    const { getByTestId } = render(
      <Harness revealWidth={100} open={false} onOpen={onOpen} onClose={onClose} />,
    );
    fireEvent.pointerUp(getByTestId('row'), pointer(-60, 0));
    expect(onOpen).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
