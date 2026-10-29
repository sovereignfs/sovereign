// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const register = vi.fn();
const update = vi.fn();
const setEnabled = vi.fn();
const rotate = vi.fn();
const remove = vi.fn();
vi.mock('../../app/console/apps/actions', () => ({
  registerAppAction: (...args: unknown[]) => register(...args) as unknown,
  updateAppAction: (...args: unknown[]) => update(...args) as unknown,
  setAppEnabledAction: (...args: unknown[]) => setEnabled(...args) as unknown,
  rotateSecretAction: (...args: unknown[]) => rotate(...args) as unknown,
  deleteAppAction: (...args: unknown[]) => remove(...args) as unknown,
}));
vi.mock('next/link', () => ({
  default: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a>,
}));

const { AppForm, NEW_APP } = await import('../../app/console/apps/app-form');
const { AppActions } = await import('../../app/console/apps/[id]/app-actions');

beforeEach(() => {
  for (const mock of [register, update, setEnabled, rotate, remove]) mock.mockReset();
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

const sent = (mock: ReturnType<typeof vi.fn>, call = 0) =>
  mock.mock.calls[call]?.[mock.mock.calls[call].length - 1] as FormData;
const dialog = () => {
  const open = document.querySelector('dialog[open]');
  if (!open) throw new Error('no dialog is open');
  return open as HTMLElement;
};
const type = (label: string | RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
/** The two fields a browser will not let an empty form past. */
const fillRequired = () => {
  type(/^Name\*?$/, 'Notes');
  type(/Sign-in addresses/, 'https://notes.example/cb');
};

describe('the form to add an app', () => {
  it('starts empty, with the scopes most apps want and the launcher on', () => {
    render(<AppForm initial={NEW_APP} />);
    expect((screen.getByLabelText(/^Name\*?$/) as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText(/Show in the launcher/) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText(/Name and picture/) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText(/Email address \(email\)/) as HTMLInputElement).checked).toBe(
      true,
    );
    expect((screen.getByLabelText(/Look people up/) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText(/Kind of app/) as HTMLSelectElement).value).toBe('confidential');
  });

  it('sends what was typed and ticked', async () => {
    register.mockResolvedValue({ ok: true, message: 'The app is added.', id: 'c1' });
    render(<AppForm initial={NEW_APP} />);
    type(/^Name\*?$/, 'Notes');
    type(/Sign-in addresses/, 'https://notes.example/cb');
    type(/Launch address/, 'https://notes.example');
    fireEvent.change(screen.getByLabelText(/Kind of app/), { target: { value: 'public' } });
    fireEvent.click(screen.getByLabelText(/Look people up/));
    fireEvent.click(screen.getByRole('button', { name: 'Add the app' }));
    await waitFor(() => expect(register).toHaveBeenCalled());
    const data = sent(register);
    expect(data.get('name')).toBe('Notes');
    expect(data.get('redirectUris')).toBe('https://notes.example/cb');
    expect(data.get('launchUrl')).toBe('https://notes.example');
    expect(data.get('type')).toBe('public');
    expect(data.getAll('scope').sort()).toEqual(['directory', 'email', 'openid', 'profile']);
    expect(data.get('show')).toBe('on');
    expect(data.get('trusted')).toBeNull();
  });

  it('always sends openid, which cannot be unticked, and never sends roles without trust', async () => {
    register.mockResolvedValue({ ok: true, message: 'ok', id: 'c1' });
    render(<AppForm initial={NEW_APP} />);
    const openid = screen.getByLabelText(/Sign people in/) as HTMLInputElement;
    expect(openid.disabled).toBe(true);
    expect((screen.getByLabelText(/Their role here/) as HTMLInputElement).disabled).toBe(true);
    fillRequired();
    fireEvent.click(screen.getByRole('button', { name: 'Add the app' }));
    await waitFor(() => expect(register).toHaveBeenCalled());
    expect(sent(register).getAll('scope')).toContain('openid');
    expect(sent(register).getAll('scope')).not.toContain('roles');
  });

  it('lets roles be given once the app is trusted, and takes it back when trust is', () => {
    render(<AppForm initial={NEW_APP} />);
    const roles = screen.getByLabelText(/Their role here/) as HTMLInputElement;
    fireEvent.click(screen.getByLabelText(/Trust this app/));
    expect(roles.disabled).toBe(false);
    fireEvent.click(roles);
    expect(roles.checked).toBe(true);
    fireEvent.click(screen.getByLabelText(/Trust this app/));
    expect(roles.checked).toBe(false);
    expect(roles.disabled).toBe(true);
  });

  it('shows each thing wrong beside its field, keeps what was typed, and shows a general line', async () => {
    register.mockResolvedValue({
      ok: false,
      error: 'Some of what was entered cannot be used.',
      fields: { name: 'The name is required.', redirectUris: 'Address 1 must be https.' },
    });
    render(<AppForm initial={NEW_APP} />);
    type(/^Name\*?$/, ' ');
    type(/Sign-in addresses/, 'http://notes.example/cb');
    fireEvent.click(screen.getByRole('button', { name: 'Add the app' }));
    expect(await screen.findByText('Some of what was entered cannot be used.')).toBeTruthy();
    expect(screen.getByLabelText(/^Name\*?$/).getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('The name is required.')).toBeTruthy();
    expect(screen.getByText('Address 1 must be https.')).toBeTruthy();
    expect((screen.getByLabelText(/Sign-in addresses/) as HTMLTextAreaElement).value).toBe(
      'http://notes.example/cb',
    );
  });

  it('shows the secret of an app just added, once, with its ID and where to go next', async () => {
    register.mockResolvedValue({
      ok: true,
      message: 'The app is added. Copy its secret now: it is shown once.',
      id: 'client-1',
      secret: 'the-secret-value',
    });
    render(<AppForm initial={NEW_APP} />);
    fillRequired();
    fireEvent.click(screen.getByRole('button', { name: 'Add the app' }));
    expect(await screen.findByText('the-secret-value')).toBeTruthy();
    expect(screen.getByText(/We keep only a scrambled copy/)).toBeTruthy();
    expect(screen.getByText('client-1')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open the app' }).getAttribute('href')).toBe(
      '/console/apps/client-1',
    );
    expect(screen.queryByRole('button', { name: 'Add the app' })).toBeNull();
  });

  it('says there is no secret to keep for an app that has none', async () => {
    register.mockResolvedValue({ ok: true, message: 'The app is added.', id: 'c2' });
    render(<AppForm initial={NEW_APP} />);
    fillRequired();
    fireEvent.click(screen.getByRole('button', { name: 'Add the app' }));
    expect(await screen.findByText('The app is added.')).toBeTruthy();
    expect(screen.queryByText(/secret/i)).toBeNull();
  });

  it('turns end-session on, and locks it, when a logout address is given', () => {
    render(<AppForm initial={NEW_APP} />);
    const box = screen.getByLabelText(/send people to core’s sign-out/) as HTMLInputElement;
    expect(box.checked).toBe(false);
    type(/Back-channel logout address/, 'https://notes.example/logout');
    expect(box.checked).toBe(true);
    expect(box.disabled).toBe(true);
    type(/Back-channel logout address/, '');
    expect(box.checked).toBe(false);
    expect(box.disabled).toBe(false);
  });
});

describe('the form to change an app', () => {
  const initial = {
    ...NEW_APP,
    name: 'Notes',
    redirectUris: ['https://notes.example/cb', 'https://notes.example/cb2'],
    postLogoutRedirectUris: ['https://notes.example/bye'],
    backchannelLogoutUri: 'https://notes.example/logout',
    endSession: true,
    scopes: ['openid', 'email', 'directory'],
    launcher: {
      description: 'Take notes',
      icon: undefined,
      launchUrl: 'https://notes.example',
      show: false,
    },
  };

  it('starts from what the app has, and does not offer to change its kind', () => {
    render(<AppForm id="c1" initial={initial} />);
    expect((screen.getByLabelText(/^Name\*?$/) as HTMLInputElement).value).toBe('Notes');
    expect((screen.getByLabelText(/Sign-in addresses/) as HTMLTextAreaElement).value).toBe(
      'https://notes.example/cb\nhttps://notes.example/cb2',
    );
    expect((screen.getByLabelText(/Show in the launcher/) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText(/Look people up/) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText(/Name and picture/) as HTMLInputElement).checked).toBe(false);
    expect(screen.queryByLabelText(/Kind of app/)).toBeNull();
  });

  it('sends the whole form for that app, and says it is saved without leaving the page', async () => {
    update.mockResolvedValue({ ok: true, message: 'The changes are saved.' });
    render(<AppForm id="c1" initial={initial} />);
    type(/^Name\*?$/, 'Notes 2');
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('The changes are saved.')).toBeTruthy();
    expect(update.mock.calls[0]?.[0]).toBe('c1');
    const data = sent(update);
    expect(data.get('name')).toBe('Notes 2');
    expect(data.get('postLogoutRedirectUris')).toBe('https://notes.example/bye');
    expect(data.get('backchannelLogoutUri')).toBe('https://notes.example/logout');
    expect(data.get('show')).toBeNull();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeTruthy();
  });
});

describe('what can be done to one app', () => {
  const show = (props: Partial<Parameters<typeof AppActions>[0]> = {}) =>
    render(<AppActions id="c1" name="Notes" enabled confidential {...props} />);
  const button = (name: string) => screen.getByRole('button', { name });

  it('asks before switching off, saying what happens, and does nothing if backed out of', () => {
    show();
    fireEvent.click(button('Switch off'));
    expect(within(dialog()).getByText('Switch this app off?')).toBeTruthy();
    expect(within(dialog()).getByText(/disappears from the launcher/)).toBeTruthy();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Cancel' }));
    expect(setEnabled).not.toHaveBeenCalled();
  });

  it('switches off when confirmed, and says so', async () => {
    setEnabled.mockResolvedValue({ ok: true, message: 'The app is switched off.' });
    show();
    fireEvent.click(button('Switch off'));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Switch off' }));
    expect(await screen.findByText('The app is switched off.')).toBeTruthy();
    expect(setEnabled).toHaveBeenCalledWith('c1', false, null);
  });

  it('switches on at once, with no question, when it is off', async () => {
    setEnabled.mockResolvedValue({ ok: true, message: 'The app is on again.' });
    show({ enabled: false });
    expect(screen.queryByRole('button', { name: 'Switch off' })).toBeNull();
    fireEvent.click(button('Switch on'));
    expect(await screen.findByText('The app is on again.')).toBeTruthy();
    expect(setEnabled).toHaveBeenCalledWith('c1', true, null);
  });

  it('warns that the old secret stops at once, then shows the new one once', async () => {
    rotate.mockResolvedValue({
      ok: true,
      message:
        'There is a new secret. The old one has stopped working. Copy this one now: it is shown once.',
      secret: 'fresh-secret',
    });
    show();
    fireEvent.click(button('Make a new secret'));
    expect(within(dialog()).getByText(/old secret stops working at once/)).toBeTruthy();
    expect(rotate).not.toHaveBeenCalled();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Make a new secret' }));
    expect(await screen.findByText('fresh-secret')).toBeTruthy();
    await waitFor(() => expect(document.querySelector('dialog[open]')).toBeNull());
  });

  it('offers no new secret for an app that keeps none', () => {
    show({ confidential: false });
    expect(screen.queryByRole('button', { name: 'Make a new secret' })).toBeNull();
  });

  it('asks before deleting, saying what is taken back, and keeps the question open on a refusal', async () => {
    remove.mockResolvedValue({ ok: false, error: 'There is no such app.' });
    show();
    fireEvent.click(button('Delete the app'));
    expect(within(dialog()).getByText(/every token, and what people agreed to share/)).toBeTruthy();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Delete the app' }));
    expect(await within(dialog()).findByText('There is no such app.')).toBeTruthy();
    expect(dialog().hasAttribute('open')).toBe(true);
  });
});
