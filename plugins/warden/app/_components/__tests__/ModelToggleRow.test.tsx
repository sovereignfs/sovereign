// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ToastProvider } from '@sovereignfs/ui';
import { ModelToggleRow } from '../ModelToggleRow';

const setModelVisibilityAction = vi.fn();
vi.mock('../../actions', () => ({
  setModelVisibilityAction: (...args: unknown[]) => setModelVisibilityAction(...args),
}));

function renderRow(props: Partial<{ modelKey: string; label: string; visible: boolean }> = {}) {
  return render(
    <ToastProvider>
      <ModelToggleRow
        modelKey={props.modelKey ?? 'conn-1:gpt-4o'}
        label={props.label ?? 'gpt-4o'}
        visible={props.visible ?? true}
      />
    </ToastProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  setModelVisibilityAction.mockResolvedValue({ ok: true, message: 'Model shown in chat.' });
});

afterEach(() => {
  cleanup();
});

describe('ModelToggleRow', () => {
  it('renders checked when visible is true', () => {
    renderRow({ visible: true });
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true');
  });

  it('renders unchecked when visible is false', () => {
    renderRow({ visible: false });
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false');
  });

  it('flips immediately (optimistic) and calls the action with the new visibility', async () => {
    renderRow({ modelKey: 'conn-1:gpt-4o', visible: true });
    fireEvent.click(screen.getByRole('switch'));

    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false');
    await waitFor(() =>
      expect(setModelVisibilityAction).toHaveBeenCalledWith('conn-1:gpt-4o', false),
    );
  });

  it('reverts and shows a toast when the action fails', async () => {
    setModelVisibilityAction.mockResolvedValue({
      ok: false,
      error: 'Could not update this model.',
    });
    renderRow({ visible: true });

    fireEvent.click(screen.getByRole('switch'));
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false');

    await waitFor(() =>
      expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true'),
    );
    expect(screen.getByText('Could not update this model.')).toBeDefined();
  });
});
