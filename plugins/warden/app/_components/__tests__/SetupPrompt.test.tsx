// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ToastProvider } from '@sovereignfs/ui';
import { SetupPrompt } from '../SetupPrompt';

const createProviderAction = vi.fn();
vi.mock('../../actions', () => ({
  createProviderAction: (...args: unknown[]) => createProviderAction(...args),
}));

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
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
    expect(push).not.toHaveBeenCalled();
  });

  it('redirects to /warden once a provider is added', async () => {
    createProviderAction.mockResolvedValue({ ok: true, message: 'OpenRouter was added.' });
    renderPrompt();
    fireEvent.click(screen.getByRole('button', { name: 'Add a provider' }));

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'OpenRouter' } });
    fireEvent.change(screen.getByLabelText('Base URL'), {
      target: { value: 'https://openrouter.ai/api/v1' },
    });
    fireEvent.change(screen.getByLabelText('API key'), { target: { value: 'sk-test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add provider' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/warden'));
  });
});
