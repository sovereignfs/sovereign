// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { useSwipeStack, type SwipeDirection, type UseSwipeStackOptions } from '../useSwipeStack';

// jsdom doesn't implement pointer capture — stub it as a no-op so
// `e.currentTarget.setPointerCapture(...)` doesn't throw.
beforeEach(() => {
  if (!HTMLElement.prototype.setPointerCapture) {
    HTMLElement.prototype.setPointerCapture = vi.fn();
  }
});

afterEach(cleanup);

function Harness(props: UseSwipeStackOptions & { triggerDirection?: SwipeDirection }) {
  const { triggerDirection, ...options } = props;
  const { cardRef, wrapRef, handlers, touchAction, triggerCommit } = useSwipeStack(options);
  return (
    <div data-testid="wrap" ref={wrapRef}>
      <div data-testid="card" ref={cardRef} data-touch-action={touchAction} {...handlers}>
        card
      </div>
      {triggerDirection && (
        <button data-testid="trigger" onClick={() => triggerCommit(triggerDirection)}>
          trigger
        </button>
      )}
    </div>
  );
}

function pointer(x: number, y: number) {
  return { clientX: x, clientY: y, pointerId: 1 };
}

function drag(el: HTMLElement, dx: number, dy: number) {
  fireEvent.pointerDown(el, pointer(0, 0));
  fireEvent.pointerMove(el, pointer(dx, dy));
  fireEvent.pointerUp(el, pointer(dx, dy));
}

describe('useSwipeStack', () => {
  it('commits when a drag crosses threshold in a live direction', () => {
    const onCommit = vi.fn();
    const { getByTestId } = render(
      <Harness directions={['up', 'down', 'left', 'right']} threshold={100} onCommit={onCommit} />,
    );
    drag(getByTestId('card'), 0, -120);
    expect(onCommit).toHaveBeenCalledWith('up');
    expect(onCommit).toHaveBeenCalledOnce();
  });

  it('springs back without committing when under threshold', () => {
    const onCommit = vi.fn();
    const { getByTestId } = render(
      <Harness directions={['up', 'down', 'left', 'right']} threshold={100} onCommit={onCommit} />,
    );
    drag(getByTestId('card'), 0, -40);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('does not commit within the deadzone even if threshold is set very low', () => {
    const onCommit = vi.fn();
    const { getByTestId } = render(
      <Harness directions={['up']} threshold={2} onCommit={onCommit} />,
    );
    drag(getByTestId('card'), 0, -5);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('treats a non-configured direction as a wall — no commit even past what would be threshold distance', () => {
    const onCommit = vi.fn();
    const { getByTestId } = render(
      <Harness directions={['up', 'down']} threshold={100} onCommit={onCommit} />,
    );
    drag(getByTestId('card'), 150, 0);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('does nothing when disabled', () => {
    const onCommit = vi.fn();
    const { getByTestId } = render(
      <Harness
        directions={['up', 'down', 'left', 'right']}
        threshold={100}
        onCommit={onCommit}
        disabled
      />,
    );
    drag(getByTestId('card'), 0, -150);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('ignores pointerup without a preceding pointerdown', () => {
    const onCommit = vi.fn();
    const { getByTestId } = render(
      <Harness directions={['up', 'down', 'left', 'right']} threshold={100} onCommit={onCommit} />,
    );
    fireEvent.pointerUp(getByTestId('card'), pointer(0, -150));
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('triggerCommit commits a live direction without a drag', () => {
    const onCommit = vi.fn();
    const { getByTestId } = render(
      <Harness directions={['up']} onCommit={onCommit} triggerDirection="up" />,
    );
    fireEvent.click(getByTestId('trigger'));
    expect(onCommit).toHaveBeenCalledWith('up');
    expect(onCommit).toHaveBeenCalledOnce();
  });

  it('triggerCommit no-ops for a direction that is not live', () => {
    const onCommit = vi.fn();
    const { getByTestId } = render(
      <Harness directions={['up']} onCommit={onCommit} triggerDirection="down" />,
    );
    fireEvent.click(getByTestId('trigger'));
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('triggerCommit does nothing when disabled', () => {
    const onCommit = vi.fn();
    const { getByTestId } = render(
      <Harness directions={['up']} onCommit={onCommit} triggerDirection="up" disabled />,
    );
    fireEvent.click(getByTestId('trigger'));
    expect(onCommit).not.toHaveBeenCalled();
  });

  describe('touchAction', () => {
    it('is none when both axes have a live direction', () => {
      const { getByTestId } = render(
        <Harness directions={['left', 'right', 'up', 'down']} onCommit={vi.fn()} />,
      );
      expect(getByTestId('card').dataset.touchAction).toBe('none');
    });

    it('is pan-y when only horizontal directions are live', () => {
      const { getByTestId } = render(<Harness directions={['left', 'right']} onCommit={vi.fn()} />);
      expect(getByTestId('card').dataset.touchAction).toBe('pan-y');
    });

    it('is pan-x when only vertical directions are live', () => {
      const { getByTestId } = render(<Harness directions={['up', 'down']} onCommit={vi.fn()} />);
      expect(getByTestId('card').dataset.touchAction).toBe('pan-x');
    });

    it('is auto when no directions are live', () => {
      const { getByTestId } = render(<Harness directions={[]} onCommit={vi.fn()} />);
      expect(getByTestId('card').dataset.touchAction).toBe('auto');
    });
  });
});
