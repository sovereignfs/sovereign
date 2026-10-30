// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ToastProvider, useToast } from '../Toast';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function Trigger({ item }: { item: Parameters<ReturnType<typeof useToast>['show']>[0] }) {
  const toast = useToast();
  return <button onClick={() => toast.show(item)}>Show</button>;
}

const show = (item: Parameters<typeof Trigger>[0]['item']) => {
  render(
    <ToastProvider>
      <Trigger item={item} />
    </ToastProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Show' }));
};

describe('Toast', () => {
  it('needs its provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Trigger item={{ title: 'x' }} />)).toThrow(/ToastProvider/);
    spy.mockRestore();
  });

  it('shows a message in a region that assistive technology announces politely', () => {
    show({ title: 'Saved', message: 'Your changes are kept.' });
    expect(screen.getByRole('list', { name: 'Notifications' }).getAttribute('aria-live')).toBe(
      'polite',
    );
    expect(screen.getByRole('status').textContent).toContain('Saved');
    expect(screen.getByText('Your changes are kept.')).toBeDefined();
  });

  it('styles it by its category', () => {
    show({ title: 'Careful', category: 'warning' });
    expect(screen.getByRole('status').className).toContain('warning');
  });

  it('goes after five seconds, with a moment to leave', () => {
    show({ title: 'Saved' });
    act(() => void vi.advanceTimersByTime(4999));
    expect(screen.getByRole('status')).toBeDefined();
    act(() => void vi.advanceTimersByTime(1));
    expect(screen.getByRole('status').className).toContain('exiting');
    act(() => void vi.advanceTimersByTime(300));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('stays while its duration is zero, until it is dismissed', () => {
    show({ title: 'Stays', duration: 0 });
    act(() => void vi.advanceTimersByTime(60_000));
    expect(screen.getByRole('status')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    act(() => void vi.advanceTimersByTime(300));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('shows several at once, in the order they came', () => {
    function Two() {
      const toast = useToast();
      return (
        <button
          onClick={() => {
            toast.show({ title: 'First' });
            toast.show({ title: 'Second' });
          }}
        >
          Show
        </button>
      );
    }
    render(
      <ToastProvider>
        <Two />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Show' }));
    expect(
      screen.getAllByRole('status').map((node) => node.textContent?.replace(/✕$/, '')),
    ).toEqual([expect.stringContaining('First'), expect.stringContaining('Second')]);
  });
});
