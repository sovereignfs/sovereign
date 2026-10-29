// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const invite = vi.fn();
const cancel = vi.fn();
vi.mock('../../app/console/invites/actions', () => ({
  inviteAction: (...args: unknown[]) => invite(...args) as unknown,
  cancelInviteAction: (...args: unknown[]) => cancel(...args) as unknown,
}));

const { InviteForm } = await import('../../app/console/invites/invite-form');
const { CancelButton } = await import('../../app/console/invites/cancel-button');

beforeEach(() => {
  invite.mockReset();
  cancel.mockReset();
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
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const submit = async (email: string, days?: string) => {
  fireEvent.change(screen.getByLabelText(/Email address/), { target: { value: email } });
  if (days !== undefined) {
    fireEvent.change(screen.getByLabelText(/Expires after/), { target: { value: days } });
  }
  fireEvent.click(screen.getByRole('button', { name: 'Invite' }));
};

describe('the form to invite', () => {
  it('asks for an address and a number of days, starting at a week', () => {
    render(<InviteForm mailReady />);
    expect((screen.getByLabelText(/Email address/) as HTMLInputElement).type).toBe('email');
    expect((screen.getByLabelText(/Expires after/) as HTMLInputElement).value).toBe('7');
    expect(screen.queryByText(/Email is not set up/)).toBeNull();
  });

  it('warns up front that nothing will be sent when email is not set up', () => {
    render(<InviteForm mailReady={false} />);
    expect(screen.getByText(/Email is not set up/)).toBeTruthy();
  });

  it('sends what was typed and says how it went', async () => {
    invite.mockResolvedValue({
      ok: true,
      message: 'We have emailed an invitation to a@example.com.',
    });
    render(<InviteForm mailReady />);
    await submit('a@example.com', '3');
    expect(await screen.findByText('We have emailed an invitation to a@example.com.')).toBeTruthy();
    const form = invite.mock.calls[0]?.[1] as FormData;
    expect(form.get('email')).toBe('a@example.com');
    expect(form.get('days')).toBe('3');
    // Done: the address is cleared for the next one, and the number of days stays.
    expect((screen.getByLabelText(/Email address/) as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText(/Expires after/) as HTMLInputElement).value).toBe('3');
  });

  it('shows the link to pass on, with a way to copy it, when nothing was sent', async () => {
    invite.mockResolvedValue({
      ok: true,
      message:
        'a@example.com is invited, but email is not set up, so nothing was sent. Pass this link on yourself:',
      link: 'http://localhost:3000/invite/abc',
    });
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    render(<InviteForm mailReady={false} />);
    await submit('a@example.com');
    expect(await screen.findByText('http://localhost:3000/invite/abc')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('http://localhost:3000/invite/abc'));
  });

  it('shows a refusal inline, as an alert, and keeps what was typed', async () => {
    invite.mockResolvedValue({ ok: false, error: 'That is not an email address.' });
    render(<InviteForm mailReady />);
    await submit('a@localhost');
    expect(await screen.findByText('That is not an email address.')).toBeTruthy();
    expect((screen.getByLabelText(/Email address/) as HTMLInputElement).value).toBe('a@localhost');
  });
});

describe('cancelling an invitation', () => {
  const open = () => {
    render(<CancelButton id="inv1" email="a@example.com" />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    const dialog = document.querySelector('dialog[open]');
    if (!dialog) throw new Error('no dialog is open');
    return dialog as HTMLElement;
  };

  it('asks first, naming the address, and does nothing if the person backs out', async () => {
    const dialog = open();
    expect(within(dialog).getByText(/a@example.com/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await act(async () => undefined);
    expect(cancel).not.toHaveBeenCalled();
  });

  it('cancels when confirmed, and closes', async () => {
    cancel.mockResolvedValue({ ok: true, message: 'The invitation is cancelled.' });
    const dialog = open();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel invitation' }));
    await waitFor(() => expect(dialog.hasAttribute('open')).toBe(false));
    expect(cancel).toHaveBeenCalledWith('inv1', null);
  });

  it('keeps the question open and shows a refusal beside it', async () => {
    cancel.mockResolvedValue({ ok: false, error: 'That invitation has already been used.' });
    const dialog = open();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel invitation' }));
    expect(await within(dialog).findByText('That invitation has already been used.')).toBeTruthy();
    expect(dialog.hasAttribute('open')).toBe(true);
  });
});
