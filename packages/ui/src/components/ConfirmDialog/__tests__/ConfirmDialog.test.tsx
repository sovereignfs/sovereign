// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ConfirmDialog } from '../ConfirmDialog';

// jsdom does not implement HTMLDialogElement.showModal()/close() (a
// long-standing, documented gap) — polyfill the minimum behavior the
// component depends on: the `open` attribute reflecting visibility, and
// close() dispatching the native 'close' event ConfirmDialog listens for.
//
// Two details matter here beyond the minimum, both load-bearing for the
// double-onClose regression tests below: (1) a no-op when already closed,
// matching the HTML spec's own early return, and (2) the 'close' event is
// queued rather than dispatched synchronously ("queue an element task ... to
// fire an event named close" per spec) — deferring it means a listener
// (re-)attached during the SAME synchronous React commit that triggered this
// close() call is still reachable once the event actually fires, exactly as
// in a real browser. Dispatching synchronously instead (the simpler version
// this replaced) fires the event in the middle of React's effect
// cleanup/setup phase, when no listener happens to be attached yet — which
// made the double-call bug this file guards against silently unreproducible
// in jsdom regardless of whether the underlying component bug was present.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    if (!this.hasAttribute('open')) return;
    this.removeAttribute('open');
    queueMicrotask(() => this.dispatchEvent(new Event('close')));
  };
});

// Flushes any chain of queueMicrotask-deferred dispatches and the React
// state updates/effects they trigger. A single real macrotask tick is
// enough: the microtask queue always fully drains — including microtasks
// newly queued from within an already-running one — before a macrotask runs.
async function flushDeferredDialogEvents() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('ConfirmDialog', () => {
  afterEach(cleanup);

  it('renders the title and message when open', () => {
    render(
      <ConfirmDialog
        open
        onClose={() => {}}
        onConfirm={() => {}}
        title="Remove passkey"
        message="This cannot be undone."
      />,
    );
    expect(screen.getByText('Remove passkey')).toBeTruthy();
    expect(screen.getByText('This cannot be undone.')).toBeTruthy();
  });

  it('renders rich message content', () => {
    render(
      <ConfirmDialog
        open
        onClose={() => {}}
        onConfirm={() => {}}
        title="Remove plugin"
        message={
          <>
            Remove <strong>Example</strong>?
          </>
        }
      />,
    );
    expect(screen.getByText('Example').tagName).toBe('STRONG');
  });

  it('calls onClose on Cancel', async () => {
    const onClose = vi.fn();
    render(
      <ConfirmDialog open onClose={onClose} onConfirm={() => {}} title="Remove" message="Sure?" />,
    );
    // Cancel now calls dialogRef.current.close() rather than onClose
    // directly (see ConfirmDialog.tsx) — onClose only fires once the
    // resulting (deferred, see the polyfill above) native 'close' event
    // reaches ConfirmDialog's own listener.
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await flushDeferredDialogEvents();
    expect(onClose).toHaveBeenCalledOnce();
  });

  // Statefully wired, unlike the test above: a real consumer's onClose flips
  // its own `open` state to false, which re-runs ConfirmDialog's internal
  // `if (open) showModal(); else el.close();` effect and calls el.close()
  // itself. Pre-fix, Cancel/backdrop-click also called onClose directly,
  // so this path fired onClose a second time; the test above's static
  // `open` prop never changes, so it can't exercise that second re-render.
  function StatefulConfirmDialog({ onCloseSpy }: { onCloseSpy: () => void }) {
    const [open, setOpen] = useState(true);
    return (
      <ConfirmDialog
        open={open}
        onClose={() => {
          onCloseSpy();
          setOpen(false);
        }}
        onConfirm={() => {}}
        title="Remove"
        message="Sure?"
      />
    );
  }

  it('calls onClose exactly once when a stateful consumer dismisses via Cancel', async () => {
    const onCloseSpy = vi.fn();
    render(<StatefulConfirmDialog onCloseSpy={onCloseSpy} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await flushDeferredDialogEvents();
    expect(onCloseSpy).toHaveBeenCalledOnce();
  });

  it('calls onClose exactly once when a stateful consumer dismisses via backdrop click', async () => {
    const onCloseSpy = vi.fn();
    render(<StatefulConfirmDialog onCloseSpy={onCloseSpy} />);
    fireEvent.click(screen.getByRole('dialog'));
    await flushDeferredDialogEvents();
    expect(onCloseSpy).toHaveBeenCalledOnce();
  });

  it('calls onConfirm on the confirm action, without itself closing', () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(
      <ConfirmDialog
        open
        onClose={onClose}
        onConfirm={onConfirm}
        title="Remove"
        message="Sure?"
        confirmLabel="Remove"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('uses custom confirm/cancel labels', () => {
    render(
      <ConfirmDialog
        open
        onClose={() => {}}
        onConfirm={() => {}}
        title="Sign out"
        message="Sign out of this device?"
        confirmLabel="Sign out"
        cancelLabel="Stay signed in"
      />,
    );
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Stay signed in' })).toBeTruthy();
  });

  it('disables both actions and shows the error slot when pending', () => {
    render(
      <ConfirmDialog
        open
        onClose={() => {}}
        onConfirm={() => {}}
        title="Remove plugin"
        message="Sure?"
        confirmLabel="Removing…"
        pending
        error="Server error — try again."
      />,
    );
    expect((screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((screen.getByRole('button', { name: 'Removing…' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(screen.getByText('Server error — try again.')).toBeTruthy();
  });

  it('renders a destructive confirm action distinctly from the default variant', () => {
    const { rerender } = render(
      <ConfirmDialog
        open
        onClose={() => {}}
        onConfirm={() => {}}
        title="Remove"
        message="Sure?"
        confirmLabel="Remove"
      />,
    );
    const defaultClass = screen.getByRole('button', { name: 'Remove' }).className;

    rerender(
      <ConfirmDialog
        open
        onClose={() => {}}
        onConfirm={() => {}}
        title="Remove"
        message="Sure?"
        confirmLabel="Remove"
        destructive
      />,
    );
    const destructiveClass = screen.getByRole('button', { name: 'Remove' }).className;
    expect(destructiveClass).not.toBe(defaultClass);
  });
});
