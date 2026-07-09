// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { useLongPress, type UseLongPressOptions } from '../useLongPress';

// Configurable matchMedia mock — usePrefersCoarsePointer reads
// '(pointer: coarse)', and the SSR-safe hooks read it on mount. Default to a
// coarse (touch) device so the suppression styles are exercised; individual
// tests override `coarse` where they assert the desktop path.
let coarse = true;
function installMatchMedia() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('pointer: coarse') ? coarse : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

// A tiny harness component: spreads the hook's handlers onto a div so we can
// fire real pointer events at it via Testing Library.
function Harness(props: UseLongPressOptions & { testId?: string }) {
  const { testId = 'target', ...options } = props;
  const handlers = useLongPress(options);
  return (
    <div data-testid={testId} {...handlers}>
      target
    </div>
  );
}

function pointer(type: 'touch' | 'mouse', x = 0, y = 0) {
  return { pointerType: type, clientX: x, clientY: y };
}

describe('useLongPress', () => {
  beforeEach(() => {
    coarse = true;
    installMatchMedia();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    cleanup();
  });

  it('fires onLongPress after the delay on a touch press held still', () => {
    const onLongPress = vi.fn();
    const { getByTestId } = render(<Harness onLongPress={onLongPress} delay={500} />);
    fireEvent.pointerDown(getByTestId('target'), pointer('touch'));
    expect(onLongPress).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(500));
    expect(onLongPress).toHaveBeenCalledOnce();
  });

  it('does not arm for a mouse pointer (desktop keeps its own affordance)', () => {
    const onLongPress = vi.fn();
    const { getByTestId } = render(<Harness onLongPress={onLongPress} delay={500} />);
    fireEvent.pointerDown(getByTestId('target'), pointer('mouse'));
    act(() => void vi.advanceTimersByTime(1000));
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('tolerates finger jitter within moveTolerance', () => {
    const onLongPress = vi.fn();
    const { getByTestId } = render(
      <Harness onLongPress={onLongPress} delay={500} moveTolerance={10} />,
    );
    const el = getByTestId('target');
    fireEvent.pointerDown(el, pointer('touch', 0, 0));
    fireEvent.pointerMove(el, pointer('touch', 4, 4)); // ~5.7px < 10
    act(() => void vi.advanceTimersByTime(500));
    expect(onLongPress).toHaveBeenCalledOnce();
  });

  it('cancels when movement exceeds moveTolerance', () => {
    const onLongPress = vi.fn();
    const { getByTestId } = render(
      <Harness onLongPress={onLongPress} delay={500} moveTolerance={10} />,
    );
    const el = getByTestId('target');
    fireEvent.pointerDown(el, pointer('touch', 0, 0));
    fireEvent.pointerMove(el, pointer('touch', 20, 0)); // 20px > 10
    act(() => void vi.advanceTimersByTime(500));
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('cancels on pointercancel (touch converted to scroll)', () => {
    const onLongPress = vi.fn();
    const { getByTestId } = render(<Harness onLongPress={onLongPress} delay={500} />);
    const el = getByTestId('target');
    fireEvent.pointerDown(el, pointer('touch'));
    fireEvent.pointerCancel(el, pointer('touch'));
    act(() => void vi.advanceTimersByTime(500));
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('suppresses the click that may follow, but only for a bounded window', () => {
    const onLongPress = vi.fn();
    const { getByTestId } = render(
      <Harness onLongPress={onLongPress} delay={500} suppressClickMs={700} />,
    );
    const el = getByTestId('target');
    fireEvent.pointerDown(el, pointer('touch'));
    act(() => void vi.advanceTimersByTime(500));
    expect(onLongPress).toHaveBeenCalledOnce();

    // A click arriving right after the long-press is swallowed.
    const suppressed = fireEvent.click(el);
    expect(suppressed).toBe(false); // preventDefault called → fireEvent returns false

    // After the suppression window, a genuinely unrelated later tap is NOT eaten.
    act(() => void vi.advanceTimersByTime(800));
    const allowed = fireEvent.click(el);
    expect(allowed).toBe(true);
  });

  it('prevents the OS context menu while a press is pending', () => {
    const { getByTestId } = render(<Harness onLongPress={vi.fn()} delay={500} />);
    const el = getByTestId('target');
    fireEvent.pointerDown(el, pointer('touch'));
    const prevented = fireEvent.contextMenu(el);
    expect(prevented).toBe(false); // preventDefault called
  });

  it('does nothing when disabled', () => {
    const onLongPress = vi.fn();
    const { getByTestId } = render(<Harness onLongPress={onLongPress} delay={500} disabled />);
    fireEvent.pointerDown(getByTestId('target'), pointer('touch'));
    act(() => void vi.advanceTimersByTime(500));
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('emits suppression styles only on coarse-pointer devices', () => {
    coarse = true;
    installMatchMedia();
    const { getByTestId, rerender } = render(<Harness onLongPress={vi.fn()} testId="coarse" />);
    // jsdom applies the inline style object; user-select none is the tell.
    expect(getByTestId('coarse').style.userSelect).toBe('none');

    coarse = false;
    installMatchMedia();
    rerender(<Harness onLongPress={vi.fn()} testId="coarse" />);
    // A remount picks up the new (fine-pointer) matchMedia result.
    cleanup();
    const fine = render(<Harness onLongPress={vi.fn()} testId="fine" />);
    expect(fine.getByTestId('fine').style.userSelect).toBe('');
  });
});
