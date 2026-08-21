// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ToastProvider, useToast } from '../Toast';

function Trigger() {
  const toast = useToast();
  return (
    <button onClick={() => toast.show({ title: 'Saved', message: 'Your changes were saved.' })}>
      Show toast
    </button>
  );
}

describe('Toast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('renders a live notifications list', () => {
    const { container } = render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    const region = container.querySelector('[aria-label="Notifications"]');
    expect(region?.getAttribute('aria-live')).toBe('polite');
  });

  it('shows a toast with the given title and message', () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Show toast' }));
    expect(screen.getByText('Saved')).toBeDefined();
    expect(screen.getByText('Your changes were saved.')).toBeDefined();
  });

  it('throws when useToast is used outside a ToastProvider', () => {
    function Broken() {
      useToast();
      return null;
    }
    expect(() => render(<Broken />)).toThrow('useToast() must be used inside <ToastProvider>');
  });

  it('dismisses a toast when its close button is clicked', () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Show toast' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(screen.queryByText('Saved')).toBeNull();
  });

  it('auto-dismisses after the default duration', () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Show toast' }));
    expect(screen.getByText('Saved')).toBeDefined();
    act(() => {
      vi.advanceTimersByTime(5250);
    });
    expect(screen.queryByText('Saved')).toBeNull();
  });
});
