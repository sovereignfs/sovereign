// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ToastProvider } from '@sovereignfs/ui';
import type { ActionResult } from '../../actions';
import { ProviderRow } from '../ProviderRow';

const deleteProviderAction = vi.fn();
const updateProviderAction = vi.fn();

vi.mock('../../actions', () => ({
  deleteProviderAction: (...args: unknown[]) => deleteProviderAction(...args),
  updateProviderAction: (...args: unknown[]) => updateProviderAction(...args),
}));

const provider = {
  id: 'conn-1',
  label: 'OpenRouter',
  baseUrl: 'https://openrouter.ai/api/v1',
  status: 'connected' as const,
  lastError: null,
  lastCheckedAt: null,
};

function renderRow(onChanged = vi.fn()) {
  return render(
    <ToastProvider>
      <ProviderRow provider={provider} discovery={undefined} onChanged={onChanged} />
    </ToastProvider>,
  );
}

// jsdom does not implement HTMLDialogElement.showModal()/close() (a
// long-standing, documented gap) — same polyfill as
// packages/ui/src/components/ConfirmDialog/__tests__/ConfirmDialog.test.tsx.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };

  vi.clearAllMocks();
  deleteProviderAction.mockImplementation(() => Promise.resolve({ ok: true, message: 'Removed' }));
});

afterEach(() => {
  cleanup();
});

describe('ProviderRow — delete', () => {
  /**
   * Regression test: live browser verification of this leg found
   * ProviderRow's ConfirmDialog `onConfirm` calling the `useActionState`
   * dispatch function directly — `deleteAction(new FormData())` — which
   * React flags as "called outside of a transition" (isPending never
   * updates). Fixed by wrapping the call in `startTransition`. This test
   * exercises the real click path (fireEvent, not a raw DOM `.click()`) so
   * a regression here fails loudly instead of only showing up as a console
   * warning during manual testing.
   */
  it('opens the confirm dialog and calls onChanged after a confirmed delete', async () => {
    const onChanged = vi.fn();
    renderRow(onChanged);

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(screen.getByText('Remove this provider?')).toBeDefined();

    const confirmButtons = screen.getAllByRole('button', { name: 'Remove' });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('does not delete when the dialog is cancelled', () => {
    renderRow();
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(document.querySelector('dialog')?.hasAttribute('open')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(document.querySelector('dialog')?.hasAttribute('open')).toBe(false);
    expect(deleteProviderAction).not.toHaveBeenCalled();
  });
});

describe('ProviderRow — edit', () => {
  it('toggles into an edit form pre-filled with the current values', () => {
    renderRow();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByDisplayValue('OpenRouter')).toBeDefined();
    expect(screen.getByDisplayValue('https://openrouter.ai/api/v1')).toBeDefined();
  });

  /**
   * Regression test for the same bug class fixed in AddProviderForm.tsx: the
   * edit form's fields stayed editable for the whole round trip to the
   * server, reading as if the submission hadn't registered — only the Save
   * button reflected `updatePending`.
   */
  it('disables the input fields while the edit submission is pending', async () => {
    let resolveAction!: (value: ActionResult) => void;
    updateProviderAction.mockImplementation(
      () =>
        new Promise<ActionResult>((resolve) => {
          resolveAction = resolve;
        }),
    );
    renderRow();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect((screen.getByLabelText('Name') as HTMLInputElement).disabled).toBe(true),
    );
    expect((screen.getByLabelText('Base URL') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText('API key') as HTMLInputElement).disabled).toBe(true);

    resolveAction({ ok: true, message: 'Saved.' });

    await waitFor(() =>
      expect((screen.getByLabelText('Name') as HTMLInputElement).disabled).toBe(false),
    );
  });
});
