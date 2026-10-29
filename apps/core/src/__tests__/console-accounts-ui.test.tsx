// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const deactivate = vi.fn();
const reactivate = vi.fn();
const resetMfa = vi.fn();
const remove = vi.fn();
const changeRole = vi.fn();
vi.mock('../../app/console/accounts/actions', () => ({
  deactivateAction: (...args: unknown[]) => deactivate(...args) as unknown,
  reactivateAction: (...args: unknown[]) => reactivate(...args) as unknown,
  resetMfaAction: (...args: unknown[]) => resetMfa(...args) as unknown,
  deleteAction: (...args: unknown[]) => remove(...args) as unknown,
  changeRoleAction: (...args: unknown[]) => changeRole(...args) as unknown,
}));
const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('next/link', () => ({
  default: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a>,
}));

const { AccountActions } = await import('../../app/console/accounts/[id]/account-actions');
const { CopyButton } = await import('../../app/console/accounts/[id]/copy-button');
const { SearchForm } = await import('../../app/console/accounts/search-form');
const { AccountsPagination } = await import('../../app/console/accounts/accounts-pagination');

beforeEach(() => {
  for (const mock of [deactivate, reactivate, resetMfa, remove, changeRole, push]) mock.mockReset();
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

const show = (props: Partial<Parameters<typeof AccountActions>[0]> = {}) =>
  render(
    <AccountActions
      id="u1"
      name="Pat Person"
      currentRole="platform:user"
      deactivated={false}
      may={{ manage: true, assignRole: false, resetMfa: false }}
      {...props}
    />,
  );
const button = (name: string | RegExp) => screen.getByRole('button', { name });
/** The one that is open: every action has its own, closed until asked. */
const dialog = () => {
  const open = document.querySelector('dialog[open]');
  if (!open) throw new Error('no dialog is open');
  return open as HTMLElement;
};

describe('the actions on one account', () => {
  it('offers what it is told the person may do, and nothing else', () => {
    show({ may: { manage: false, assignRole: false, resetMfa: false } });
    expect(screen.queryByRole('button')).toBeNull();
    cleanup();
    show({ may: { manage: true, assignRole: false, resetMfa: false } });
    expect(screen.getByRole('button', { name: 'Deactivate' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete account' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Reset two-factor sign-in' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Change role' })).toBeNull();
  });

  it('asks before it does anything, and does nothing if the person backs out', async () => {
    show();
    fireEvent.click(button('Deactivate'));
    expect(within(dialog()).getByText('Deactivate this account?')).toBeTruthy();
    expect(deactivate).not.toHaveBeenCalled();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Cancel' }));
    await act(async () => undefined);
    expect(deactivate).not.toHaveBeenCalled();
  });

  it('does it when confirmed, closes, and says how it went', async () => {
    deactivate.mockResolvedValue({ ok: true, message: 'The account is deactivated.' });
    show();
    fireEvent.click(button('Deactivate'));
    const asked = dialog();
    fireEvent.click(within(asked).getByRole('button', { name: 'Deactivate' }));
    expect(await screen.findByText('The account is deactivated.')).toBeTruthy();
    expect(deactivate).toHaveBeenCalledWith('u1', null);
    await waitFor(() => expect(asked.hasAttribute('open')).toBe(false));
  });

  it('keeps the question open and shows a refusal beside it', async () => {
    remove.mockResolvedValue({
      ok: false,
      error: 'Only the owner can act on an operator account.',
    });
    show();
    fireEvent.click(button('Delete account'));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Delete' }));
    expect(
      await within(dialog()).findByText('Only the owner can act on an operator account.'),
    ).toBeTruthy();
    expect(dialog().hasAttribute('open')).toBe(true);
  });

  it('offers reactivation, not deactivation, for an account that is deactivated', async () => {
    reactivate.mockResolvedValue({ ok: true, message: 'The account can sign in again.' });
    show({ deactivated: true });
    expect(screen.queryByRole('button', { name: 'Deactivate' })).toBeNull();
    fireEvent.click(button('Reactivate'));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Reactivate' }));
    expect(await screen.findByText('The account can sign in again.')).toBeTruthy();
  });

  it('resets two-factor sign-in when it is offered and confirmed', async () => {
    resetMfa.mockResolvedValue({
      ok: true,
      message: 'Two-factor sign-in is reset, and they have been emailed.',
    });
    show({ may: { manage: true, assignRole: false, resetMfa: true } });
    fireEvent.click(button('Reset two-factor sign-in'));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Reset' }));
    expect(await screen.findByText(/they have been emailed/)).toBeTruthy();
  });

  it('names the account in what it asks, so nobody confirms the wrong one', () => {
    show();
    fireEvent.click(button('Delete account'));
    expect(within(dialog()).getByText(/Pat Person’s account/)).toBeTruthy();
  });

  it('changes a role for those who may, starting from the role it has', async () => {
    changeRole.mockResolvedValue({ ok: true, message: 'The role is changed.' });
    show({
      currentRole: 'platform:admin',
      may: { manage: false, assignRole: true, resetMfa: false },
    });
    const select = screen.getByLabelText('Role') as HTMLSelectElement;
    expect(select.value).toBe('platform:admin');
    fireEvent.change(select, { target: { value: 'platform:user' } });
    fireEvent.click(button('Change role'));
    expect(await screen.findByText('The role is changed.')).toBeTruthy();
    const form = changeRole.mock.calls[0]?.[2] as FormData;
    expect(form.get('role')).toBe('platform:user');
  });

  it('offers no role the owner could not give: only admin and user', () => {
    show({ may: { manage: false, assignRole: true, resetMfa: false } });
    expect(
      [...(screen.getByLabelText('Role') as HTMLSelectElement).options].map((o) => o.value),
    ).toEqual(['platform:user', 'platform:admin']);
  });
});

import { within } from '@testing-library/react';

describe('copying the account ID', () => {
  it('puts the text on the clipboard and says it was copied', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    render(<CopyButton text="abc123" label="Copy" />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeTruthy();
    expect(writeText).toHaveBeenCalledWith('abc123');
  });

  it('says so when the browser will not let it', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('no')) },
    });
    render(<CopyButton text="abc123" label="Copy" />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(await screen.findByRole('button', { name: 'Could not copy' })).toBeTruthy();
  });

  it('does not touch the clipboard until asked', () => {
    const writeText = vi.fn();
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    render(<CopyButton text="abc123" label="Copy" />);
    expect(writeText).not.toHaveBeenCalled();
  });
});

describe('the search form', () => {
  it('is a plain form that gets the list, with what was searched for in the box', () => {
    render(<SearchForm query="pat" />);
    const form = screen.getByRole('search') as HTMLFormElement;
    expect(form.getAttribute('method')).toBe('get');
    expect(form.getAttribute('action')).toBe('/console/accounts');
    expect((screen.getByLabelText('Search accounts') as HTMLInputElement).value).toBe('pat');
    expect((screen.getByLabelText('Search accounts') as HTMLInputElement).name).toBe('q');
    expect(screen.getByRole('link', { name: 'Clear' }).getAttribute('href')).toBe(
      '/console/accounts',
    );
  });

  it('has nothing to clear when nothing was searched for', () => {
    render(<SearchForm query="" />);
    expect(screen.queryByRole('link', { name: 'Clear' })).toBeNull();
  });
});

describe('the pages of the list', () => {
  it('goes to another page, keeping what was searched for, and to none for the first', () => {
    render(<AccountsPagination page={2} pages={5} query="pat" />);
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(push).toHaveBeenLastCalledWith('/console/accounts?q=pat&page=3');
    fireEvent.click(screen.getByRole('button', { name: 'Previous page' }));
    expect(push).toHaveBeenLastCalledWith('/console/accounts?q=pat');
  });

  it('keeps nothing when nothing was searched for', () => {
    render(<AccountsPagination page={1} pages={3} query="" />);
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(push).toHaveBeenLastCalledWith('/console/accounts?page=2');
  });
});
