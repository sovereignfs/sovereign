// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ROLE_ADMIN, ROLE_OWNER, ROLE_USER } from '../auth/roles';
import { AccountActionError } from '../accounts/manage';
import { DEFAULT_MATRIX } from '../roles/capabilities';

const getSession = vi.fn();
vi.mock('../auth/session', () => ({ getSession: () => getSession() as unknown }));
const matrixInForce = vi.fn();
vi.mock('../roles/matrix', () => ({ getCapabilityMatrix: () => matrixInForce() as unknown }));
const redirect = vi.fn();
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    redirect(to);
    const error = new Error(`NEXT_REDIRECT ${to}`) as Error & { digest: string };
    error.digest = `NEXT_REDIRECT;replace;${to};307;`;
    throw error;
  },
}));
vi.mock('next/link', () => ({
  default: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a>,
}));
vi.mock('../database', () => ({ getDatabase: () => Promise.resolve({}) }));
vi.mock('../auth', () => ({ getAuth: () => Promise.resolve({}) }));
const confirm = vi.fn();
vi.mock('../auth/confirm-password', () => ({
  confirmPassword: (...args: unknown[]) => confirm(...args) as unknown,
}));
const deleteSelf = vi.fn();
vi.mock('../accounts', async (original) => ({
  ...(await original<typeof import('../accounts')>()),
  getAccountManager: () => Promise.resolve({ deleteSelf }),
}));

const { deleteAccountAction } = await import('../../app/delete-account/actions');
const { default: DeleteAccountPage } = await import('../../app/delete-account/page');
const { DeleteForm } = await import('../../app/delete-account/delete-form');

const signedInAs = (id: string, role: unknown) =>
  getSession.mockResolvedValue({ user: { id, role }, session: { id: 's1' } });
const form = (password?: string) => {
  const data = new FormData();
  if (password !== undefined) data.set('password', password);
  return data;
};
const failure = async (run: () => Promise<unknown>) => {
  try {
    await run();
  } catch (error) {
    return error as { code?: string; message: string; digest?: string };
  }
  return undefined;
};

beforeEach(() => {
  getSession.mockReset().mockResolvedValue(null);
  matrixInForce.mockReset().mockResolvedValue(DEFAULT_MATRIX);
  redirect.mockReset();
  confirm.mockReset().mockResolvedValue('ok');
  deleteSelf.mockReset().mockResolvedValue(undefined);
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

describe('deleting one’s own account, as a public endpoint', () => {
  it('is refused for nobody signed in, and nothing is asked or deleted', async () => {
    expect(await failure(() => deleteAccountAction(null, form('pw')))).toMatchObject({
      code: 'unauthenticated',
    });
    expect(confirm).not.toHaveBeenCalled();
    expect(deleteSelf).not.toHaveBeenCalled();
  });

  it('is refused for a role that does not hold profile:manage', async () => {
    signedInAs('u1', ROLE_USER);
    matrixInForce.mockResolvedValue({
      [ROLE_ADMIN]: DEFAULT_MATRIX[ROLE_ADMIN],
      [ROLE_USER]: new Set(['launcher:access']),
    });
    expect(await failure(() => deleteAccountAction(null, form('pw')))).toMatchObject({
      code: 'forbidden',
    });
    expect(deleteSelf).not.toHaveBeenCalled();
  });

  it('asks the password of the signed-in person and deletes that account, then leaves for sign-in', async () => {
    signedInAs('me', ROLE_USER);
    const thrown = await failure(() => deleteAccountAction(null, form('right')));
    expect(thrown?.message).toBe('NEXT_REDIRECT /sign-in?deleted=1');
    expect(confirm.mock.calls[0]?.slice(2)).toEqual(['me', 'right']);
    expect(deleteSelf).toHaveBeenCalledWith({ id: 'me', role: ROLE_USER });
  });

  it('says in words when the password is wrong, and deletes nothing', async () => {
    signedInAs('me', ROLE_USER);
    confirm.mockResolvedValue('wrong');
    expect(await deleteAccountAction(null, form('nope'))).toEqual({
      ok: false,
      error: 'That password is not right.',
    });
    expect(deleteSelf).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it('says so when too many wrong passwords were given, and deletes nothing', async () => {
    signedInAs('me', ROLE_USER);
    confirm.mockResolvedValue('limited');
    expect(await deleteAccountAction(null, form('x'))).toEqual({
      ok: false,
      error: 'Too many wrong passwords. Wait a few minutes, then try again.',
    });
    expect(deleteSelf).not.toHaveBeenCalled();
  });

  it('treats a missing or non-text password as no password', async () => {
    signedInAs('me', ROLE_USER);
    confirm.mockImplementation((_d: unknown, _a: unknown, _id: string, password: string) =>
      Promise.resolve(password === '' ? 'wrong' : 'ok'),
    );
    const data = new FormData();
    data.set('password', new File(['x'], 'x'));
    expect((await deleteAccountAction(null, data)).ok).toBe(false);
    expect((await deleteAccountAction(null, form())).ok).toBe(false);
    expect(deleteSelf).not.toHaveBeenCalled();
  });

  it('shows what the manager refuses with, as the owner is told to hand the instance over first', async () => {
    signedInAs('boss', ROLE_OWNER);
    deleteSelf.mockRejectedValue(
      new AccountActionError(
        'owner',
        'You own this instance. Hand it to another admin first, then you can delete your account.',
      ),
    );
    expect(await deleteAccountAction(null, form('right'))).toEqual({
      ok: false,
      error:
        'You own this instance. Hand it to another admin first, then you can delete your account.',
    });
    expect(redirect).not.toHaveBeenCalled();
  });

  it('lets a fault through rather than saying it worked', async () => {
    signedInAs('me', ROLE_USER);
    deleteSelf.mockRejectedValue(new Error('the database is down'));
    await expect(deleteAccountAction(null, form('right'))).rejects.toThrow('database');
  });
});

describe('the delete account page', () => {
  it('sends someone with no session to sign in', async () => {
    getSession.mockResolvedValue(null);
    await expect(DeleteAccountPage()).rejects.toMatchObject({
      digest: expect.stringContaining('/sign-in'),
    });
  });

  it('has one heading, says what is lost, and offers the form', async () => {
    signedInAs('me', ROLE_USER);
    const html = renderToStaticMarkup(await DeleteAccountPage());
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    expect(html).toContain('cannot be undone');
    expect(html).toContain('Delete my account');
    expect(html).toContain('type="password"');
  });

  it('tells the owner to hand the instance over first, with the way to do it, and offers no form', async () => {
    signedInAs('boss', ROLE_OWNER);
    const html = renderToStaticMarkup(await DeleteAccountPage());
    expect(html).toContain('You own this instance');
    expect(html).toContain('href="/console/ownership"');
    expect(html).not.toContain('type="password"');
    expect(html).not.toContain('Delete my account');
  });
});

describe('the form', () => {
  const dialog = () => {
    const open = document.querySelector('dialog[open]');
    if (!open) throw new Error('no dialog is open');
    return open as HTMLElement;
  };

  it('cannot be sent without a password, and asks before sending anything', () => {
    render(<DeleteForm />);
    const button = screen.getByRole('button', { name: 'Delete my account…' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Your password/), { target: { value: 'pw' } });
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    expect(within(dialog()).getByText('Delete your account?')).toBeTruthy();
    expect(deleteSelf).not.toHaveBeenCalled();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Cancel' }));
    expect(confirm).not.toHaveBeenCalled();
  });

  it('sends the password once confirmed, and keeps the question open for a wrong one', async () => {
    confirm.mockResolvedValue('wrong');
    signedInAs('me', ROLE_USER);
    render(<DeleteForm />);
    fireEvent.change(screen.getByLabelText(/Your password/), { target: { value: 'guess' } });
    fireEvent.click(screen.getByRole('button', { name: 'Delete my account…' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Delete my account' }));
    expect(await within(dialog()).findByText('That password is not right.')).toBeTruthy();
    expect(confirm.mock.calls[0]?.[3]).toBe('guess');
    expect(dialog().hasAttribute('open')).toBe(true);
    expect((screen.getByLabelText(/Your password/) as HTMLInputElement).value).toBe('guess');
    await waitFor(() => expect(deleteSelf).not.toHaveBeenCalled());
  });
});
