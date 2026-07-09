// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { useDoubleTapHandler, useSingleOrDoubleTap } from '../useDoubleTap';

// A minimal harness: the hook returns a handler bound to onClick. Real
// double-clicks report detail===2; two separate taps report detail===1 each.
function DoubleTapHarness({ onDouble }: { onDouble: () => void }) {
  const handle = useDoubleTapHandler<React.MouseEvent>(() => onDouble());
  return (
    <button data-testid="btn" onClick={handle}>
      tap
    </button>
  );
}

function SingleOrDoubleHarness({
  onSingle,
  onDouble,
}: {
  onSingle: () => void;
  onDouble: () => void;
}) {
  const handle = useSingleOrDoubleTap<React.MouseEvent>(
    () => onSingle(),
    () => onDouble(),
  );
  return (
    <button data-testid="btn" onClick={handle}>
      tap
    </button>
  );
}

describe('useDoubleTapHandler', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('fires immediately on a native double-click (detail === 2)', () => {
    const onDouble = vi.fn();
    const { getByTestId } = render(<DoubleTapHarness onDouble={onDouble} />);
    fireEvent.click(getByTestId('btn'), { detail: 2 });
    expect(onDouble).toHaveBeenCalledOnce();
  });

  it('fires on two touch taps within the window', () => {
    const onDouble = vi.fn();
    const { getByTestId } = render(<DoubleTapHarness onDouble={onDouble} />);
    const btn = getByTestId('btn');
    fireEvent.click(btn, { detail: 1 });
    act(() => void vi.advanceTimersByTime(100));
    fireEvent.click(btn, { detail: 1 });
    expect(onDouble).toHaveBeenCalledOnce();
  });

  it('does not fire on a single tap', () => {
    const onDouble = vi.fn();
    const { getByTestId } = render(<DoubleTapHarness onDouble={onDouble} />);
    fireEvent.click(getByTestId('btn'), { detail: 1 });
    act(() => void vi.advanceTimersByTime(1000));
    expect(onDouble).not.toHaveBeenCalled();
  });
});

describe('useSingleOrDoubleTap', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('defers the single action until the double-tap window closes', () => {
    const onSingle = vi.fn();
    const onDouble = vi.fn();
    const { getByTestId } = render(
      <SingleOrDoubleHarness onSingle={onSingle} onDouble={onDouble} />,
    );
    fireEvent.click(getByTestId('btn'), { detail: 1 });
    // Single must NOT have fired yet — this deferral is the whole point.
    expect(onSingle).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(350));
    expect(onSingle).toHaveBeenCalledOnce();
    expect(onDouble).not.toHaveBeenCalled();
  });

  it('fires double (and never single) when a second tap arrives in time', () => {
    const onSingle = vi.fn();
    const onDouble = vi.fn();
    const { getByTestId } = render(
      <SingleOrDoubleHarness onSingle={onSingle} onDouble={onDouble} />,
    );
    const btn = getByTestId('btn');
    fireEvent.click(btn, { detail: 1 });
    act(() => void vi.advanceTimersByTime(100));
    fireEvent.click(btn, { detail: 1 });
    act(() => void vi.advanceTimersByTime(500));
    expect(onDouble).toHaveBeenCalledOnce();
    expect(onSingle).not.toHaveBeenCalled();
  });

  it('fires double on a native double-click and cancels the pending single', () => {
    const onSingle = vi.fn();
    const onDouble = vi.fn();
    const { getByTestId } = render(
      <SingleOrDoubleHarness onSingle={onSingle} onDouble={onDouble} />,
    );
    const btn = getByTestId('btn');
    fireEvent.click(btn, { detail: 1 });
    fireEvent.click(btn, { detail: 2 });
    act(() => void vi.advanceTimersByTime(500));
    expect(onDouble).toHaveBeenCalledOnce();
    expect(onSingle).not.toHaveBeenCalled();
  });
});
