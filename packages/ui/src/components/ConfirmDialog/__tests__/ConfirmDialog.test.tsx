// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ConfirmDialog } from '../ConfirmDialog';

// jsdom does not implement HTMLDialogElement.showModal()/close() (a
// long-standing, documented gap) — polyfill the minimum behavior the
// component depends on: the `open` attribute reflecting visibility, and
// close() dispatching the native 'close' event ConfirmDialog listens for.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
});

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

  it('calls onClose on Cancel', () => {
    const onClose = vi.fn();
    render(
      <ConfirmDialog open onClose={onClose} onConfirm={() => {}} title="Remove" message="Sure?" />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledOnce();
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
