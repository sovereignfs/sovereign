// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ExportPanel } from '../ExportPanel';

afterEach(cleanup);

// jsdom has no HTMLDialogElement.showModal()/close(): the minimum ConfirmDialog needs (see its own test).
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

const props = {
  downloadAction: (id: string) => `/api/exports/${id}?kind=person`,
  confirmTitle: 'Download your data?',
  confirmMessage: 'Ready once, within the hour.',
  startLabel: 'Get my data',
};
const at = Date.UTC(2026, 10, 20, 10, 0);

describe('ExportPanel', () => {
  it('asks for the password, confirms, and starts with what was typed', async () => {
    const onStart = vi.fn(async () => ({ ok: true }) as const);
    const onRefresh = vi.fn();
    render(
      <ExportPanel {...props} status={{ state: 'none' }} onStart={onStart} onRefresh={onRefresh} />,
    );
    const button = screen.getByRole('button', { name: 'Get my data' });
    expect(button.hasAttribute('disabled')).toBe(true);
    fireEvent.change(screen.getByLabelText(/Your password/), { target: { value: 'secret words' } });
    fireEvent.click(button);
    expect(screen.getByText('Download your data?')).toBeDefined();
    fireEvent.click(screen.getAllByRole('button', { name: 'Get my data' }).at(-1) as HTMLElement);
    await waitFor(() => expect(onStart).toHaveBeenCalledWith('secret words'));
    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
  });

  it('shows what was refused, and keeps the password', async () => {
    render(
      <ExportPanel
        {...props}
        status={{ state: 'none' }}
        onStart={async () => ({ ok: false, error: 'That password is not right.' })}
      />,
    );
    fireEvent.change(screen.getByLabelText(/Your password/), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: 'Get my data' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Get my data' }).at(-1) as HTMLElement);
    await waitFor(() =>
      expect(screen.getAllByText('That password is not right.').length).toBeGreaterThan(0),
    );
    expect((screen.getByLabelText(/Your password/) as HTMLInputElement).value).toBe('wrong');
  });

  it('offers a ready export once, by a form that posts to where the consumer said', () => {
    const { container } = render(
      <ExportPanel
        {...props}
        status={{ state: 'ready', id: 'j1', size: 2048, until: at, here: true }}
        onStart={vi.fn()}
      />,
    );
    const form = container.querySelector('form[method="post"]');
    expect(form?.getAttribute('action')).toBe('/api/exports/j1?kind=person');
    expect(screen.getByText(/ready \(2 KB\).*until 10:00/)).toBeDefined();
  });

  it('says a ready export is in another browser, and offers no download here', () => {
    const { container } = render(
      <ExportPanel
        {...props}
        status={{ state: 'ready', id: 'j1', size: 2048, until: at, here: false }}
        onStart={vi.fn()}
      />,
    );
    expect(container.querySelector('form[method="post"]')).toBeNull();
    expect(screen.getByText(/in the browser that asked for it/)).toBeDefined();
  });

  it('turns the form off with the reason, and shows nothing to start while one is made', () => {
    const { rerender } = render(
      <ExportPanel
        {...props}
        status={{ state: 'none' }}
        disabledReason="Save a key first."
        onStart={vi.fn()}
      />,
    );
    expect(screen.getByText('Save a key first.')).toBeDefined();
    expect(screen.getByLabelText(/Your password/).hasAttribute('disabled')).toBe(true);
    rerender(
      <ExportPanel {...props} status={{ state: 'making', requestedAt: at }} onStart={vi.fn()} />,
    );
    expect(screen.queryByLabelText(/Your password/)).toBeNull();
    expect(screen.getByText(/being made, since 10:00/)).toBeDefined();
  });
});
