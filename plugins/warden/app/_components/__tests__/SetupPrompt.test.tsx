// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ToastProvider } from '@sovereignfs/ui';
import { SetupPrompt } from '../SetupPrompt';

const createProviderAction = vi.fn();
vi.mock('../../actions', () => ({
  createProviderAction: (...args: unknown[]) => createProviderAction(...args),
}));

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

function renderPrompt() {
  return render(
    <ToastProvider>
      <SetupPrompt />
    </ToastProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('SetupPrompt', () => {
  it('shows the empty state with no form until "Add a provider" is clicked', () => {
    renderPrompt();
    expect(screen.getByText('Set up Warden')).toBeDefined();
    expect(screen.queryByLabelText('Name')).toBeNull();
    expect(screen.queryByLabelText('Base URL')).toBeNull();
  });

  it('expands the add-provider form in place, without navigating away', () => {
    renderPrompt();
    fireEvent.click(screen.getByRole('button', { name: 'Add a provider' }));

    expect(screen.getByLabelText('Name')).toBeDefined();
    expect(screen.getByLabelText('Base URL')).toBeDefined();
    expect(screen.queryByText('Set up Warden')).toBeNull();
    expect(refresh).not.toHaveBeenCalled();
  });

  /**
   * Regression test for a real bug found live: this used to call
   * `router.push('/warden')` — a no-op navigation, since this component only
   * ever renders *at* `/warden`. Next's client Router Cache could then keep
   * serving the already-rendered (stale) payload for that URL instead of
   * re-running the Server Component, so the chat view never appeared without
   * a manual reload. `router.refresh()` is the call that actually forces the
   * current route to re-fetch server data.
   */
  it('calls router.refresh() (not push) once a provider is added', async () => {
    createProviderAction.mockResolvedValue({ ok: true, message: 'OpenRouter was added.' });
    renderPrompt();
    fireEvent.click(screen.getByRole('button', { name: 'Add a provider' }));

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'OpenRouter' } });
    fireEvent.change(screen.getByLabelText('Base URL'), {
      target: { value: 'https://openrouter.ai/api/v1' },
    });
    fireEvent.change(screen.getByLabelText('API key'), { target: { value: 'sk-test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add provider' }));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });
});
