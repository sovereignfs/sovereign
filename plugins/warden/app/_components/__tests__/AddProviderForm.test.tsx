// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ToastProvider } from '@sovereignfs/ui';
import { AddProviderForm } from '../AddProviderForm';

const createProviderAction = vi.fn();
vi.mock('../../actions', () => ({
  createProviderAction: (...args: unknown[]) => createProviderAction(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

function fillAndSubmit() {
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'OpenRouter' } });
  fireEvent.change(screen.getByLabelText('Base URL'), {
    target: { value: 'https://openrouter.ai/api/v1' },
  });
  fireEvent.change(screen.getByLabelText('API key'), { target: { value: 'sk-test' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add provider' }));
}

describe('AddProviderForm', () => {
  it('shows a success toast and calls onAdded once on a successful submission', async () => {
    createProviderAction.mockResolvedValue({ ok: true, message: 'OpenRouter was added.' });
    const onAdded = vi.fn();
    render(
      <ToastProvider>
        <AddProviderForm onAdded={onAdded} />
      </ToastProvider>,
    );

    fillAndSubmit();

    await waitFor(() => expect(onAdded).toHaveBeenCalledTimes(1));
    expect(screen.getAllByText('OpenRouter was added.')).toHaveLength(1);
  });

  /**
   * Regression test for a real bug found live: `SetupPrompt` passed
   * `onAdded={() => router.push('/warden')}` — a fresh closure every render.
   * `router.push()` re-rendering the segment (even navigating to the
   * *current* route) handed this component a new `onAdded` reference on its
   * own, which retriggered the success effect with no new submission,
   * replaying the toast and calling `onAdded` again — a loop that produced
   * four stacked "provider was added" toasts from one submission. Re-passing
   * a new `onAdded` identity here, with no further action call, must not
   * re-fire the effect.
   */
  it('does not replay the success toast or re-call onAdded when only the onAdded prop identity changes', async () => {
    createProviderAction.mockResolvedValue({ ok: true, message: 'OpenRouter was added.' });
    const onAddedFirst = vi.fn();
    const { rerender } = render(
      <ToastProvider>
        <AddProviderForm onAdded={onAddedFirst} />
      </ToastProvider>,
    );

    fillAndSubmit();
    await waitFor(() => expect(onAddedFirst).toHaveBeenCalledTimes(1));

    const onAddedSecond = vi.fn();
    rerender(
      <ToastProvider>
        <AddProviderForm onAdded={onAddedSecond} />
      </ToastProvider>,
    );

    expect(onAddedSecond).not.toHaveBeenCalled();
    expect(onAddedFirst).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText('OpenRouter was added.')).toHaveLength(1);
  });
});
