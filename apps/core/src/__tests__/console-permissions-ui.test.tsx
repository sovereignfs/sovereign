// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_MATRIX } from '../roles/capabilities';
import { describeMatrix } from '../roles/describe';

const saveMatrix = vi.fn();
const resetMatrix = vi.fn();
vi.mock('../../app/console/permissions/actions', () => ({
  saveMatrixAction: (...args: unknown[]) => saveMatrix(...args) as unknown,
  resetMatrixAction: (...args: unknown[]) => resetMatrix(...args) as unknown,
}));
const transfer = vi.fn();
vi.mock('../../app/console/ownership/actions', () => ({
  transferOwnershipAction: (...args: unknown[]) => transfer(...args) as unknown,
}));

const { MatrixEditor } = await import('../../app/console/permissions/matrix-editor');
const { TransferForm } = await import('../../app/console/ownership/transfer-form');

beforeEach(() => {
  for (const mock of [saveMatrix, resetMatrix, transfer]) mock.mockReset();
  // jsdom does not implement the dialog's showModal and close.
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    if (!this.hasAttribute('open')) return;
    this.removeAttribute('open');
    queueMicrotask(() => this.dispatchEvent(new Event('close')));
  };
});
afterEach(cleanup);

const grants = (form: FormData) => form.getAll('grant').map(String);
const dialog = () => {
  const open = document.querySelector('dialog[open]');
  if (!open) throw new Error('no dialog is open');
  return open as HTMLElement;
};

describe('the matrix editor', () => {
  const rows = () => describeMatrix(DEFAULT_MATRIX);
  const box = (role: string, label: string) => {
    const row = screen.getByText(label).closest('li') as HTMLElement;
    return within(row).getByRole('checkbox', { name: role }) as HTMLInputElement;
  };

  it('starts from what is in force, and offers nothing for what only the owner holds', () => {
    render(<MatrixEditor rows={rows()} />);
    expect(box('Admins', 'Manage apps').checked).toBe(true);
    expect(box('Users', 'Manage apps').checked).toBe(false);
    expect(box('Users', 'Use the app launcher').checked).toBe(true);
    const ownerOnly = screen.getByText('Set up email sending').closest('li') as HTMLElement;
    expect(within(ownerOnly).queryByRole('checkbox')).toBeNull();
    expect(within(ownerOnly).getByText('Only the owner')).toBeTruthy();
  });

  it('sends every box that is ticked, and only those, with the change that was made', async () => {
    saveMatrix.mockResolvedValue({ ok: true, message: 'One change is saved. It applies at once.' });
    render(<MatrixEditor rows={rows()} />);
    fireEvent.click(box('Admins', 'Manage apps'));
    fireEvent.click(box('Users', 'See the list of accounts'));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('One change is saved. It applies at once.')).toBeTruthy();
    const sent = grants(saveMatrix.mock.calls[0]?.[1] as FormData);
    expect(sent).not.toContain('platform:admin|client:manage');
    expect(sent).toContain('platform:user|user:view');
    expect(sent).toContain('platform:admin|user:manage');
    expect(sent.some((value) => value.includes('instance:configure-secrets'))).toBe(false);
  });

  it('shows a refusal and leaves the boxes as they were', async () => {
    saveMatrix.mockResolvedValue({
      ok: false,
      error: 'Only the owner can change the capability matrix.',
    });
    render(<MatrixEditor rows={rows()} />);
    fireEvent.click(box('Users', 'Manage apps'));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText(/Only the owner can change/)).toBeTruthy();
    expect(box('Users', 'Manage apps').checked).toBe(true);
  });

  it('offers the defaults only once something differs from them, and asks before going back', async () => {
    const edited = describeMatrix(DEFAULT_MATRIX).map((row) =>
      row.capability === 'client:manage' ? { ...row, admin: false } : row,
    );
    resetMatrix.mockResolvedValue({ ok: true, message: 'Every role is back to the defaults.' });
    render(<MatrixEditor rows={edited} />);
    expect(box('Admins', 'Manage apps').checked).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Back to the defaults' }));
    expect(resetMatrix).not.toHaveBeenCalled();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Back to the defaults' }));
    expect(await screen.findByText('Every role is back to the defaults.')).toBeTruthy();
    await waitFor(() => expect(box('Admins', 'Manage apps').checked).toBe(true));
  });

  it('does not offer the defaults while the matrix is the defaults', () => {
    render(<MatrixEditor rows={rows()} />);
    expect(screen.queryByRole('button', { name: 'Back to the defaults' })).toBeNull();
  });
});

describe('the ownership form', () => {
  const targets = [
    { id: 'a1', name: 'Ada Admin', email: 'ada@example.com' },
    { id: 'a2', name: 'Bo Admin', email: 'bo@example.com' },
  ];
  const fill = (id = 'a1', password = 'my-password') => {
    fireEvent.change(screen.getByLabelText(/New owner/), { target: { value: id } });
    fireEvent.change(screen.getByLabelText(/Your password/), { target: { value: password } });
  };

  it('cannot be sent until someone is chosen and the password is typed', () => {
    render(<TransferForm targets={targets} />);
    const button = screen.getByRole('button', {
      name: 'Hand over ownership…',
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/New owner/), { target: { value: 'a1' } });
    expect(button.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Your password/), { target: { value: 'x' } });
    expect(button.disabled).toBe(false);
  });

  it('asks first, naming who will own it, and sends nothing until confirmed', () => {
    render(<TransferForm targets={targets} />);
    fill('a2');
    fireEvent.click(screen.getByRole('button', { name: 'Hand over ownership…' }));
    expect(within(dialog()).getByText('Hand over this instance?')).toBeTruthy();
    expect(within(dialog()).getByText('Bo Admin')).toBeTruthy();
    expect(transfer).not.toHaveBeenCalled();
  });

  it('sends the choice, what the owner becomes and the password once confirmed', async () => {
    transfer.mockResolvedValue({ ok: true });
    render(<TransferForm targets={targets} />);
    fill('a1', 'my-password');
    fireEvent.change(screen.getByLabelText(/You will become/), {
      target: { value: 'platform:user' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Hand over ownership…' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Hand over ownership' }));
    await waitFor(() => expect(transfer).toHaveBeenCalledTimes(1));
    const sent = transfer.mock.calls[0]?.[1] as FormData;
    expect(sent.get('target')).toBe('a1');
    expect(sent.get('newRole')).toBe('platform:user');
    expect(sent.get('password')).toBe('my-password');
  });

  it('keeps the question open to show a wrong password, and keeps what was typed', async () => {
    transfer.mockResolvedValue({ ok: false, error: 'That password is not right.' });
    render(<TransferForm targets={targets} />);
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Hand over ownership…' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Hand over ownership' }));
    expect(await within(dialog()).findByText('That password is not right.')).toBeTruthy();
    expect(dialog().hasAttribute('open')).toBe(true);
    expect((screen.getByLabelText(/Your password/) as HTMLInputElement).value).toBe('my-password');
  });

  it('does nothing when the question is backed out of', () => {
    render(<TransferForm targets={targets} />);
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Hand over ownership…' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Cancel' }));
    expect(transfer).not.toHaveBeenCalled();
  });
});
