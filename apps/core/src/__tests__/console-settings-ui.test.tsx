// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ShownSmtp } from '../instance/describe';

const saveName = vi.fn();
const resetName = vi.fn();
const saveInviteOnly = vi.fn();
const resetInviteOnly = vi.fn();
const saveSmtp = vi.fn();
const resetSmtp = vi.fn();
vi.mock('../../app/console/settings/actions', () => ({
  saveNameAction: (...args: unknown[]) => saveName(...args) as unknown,
  resetNameAction: (...args: unknown[]) => resetName(...args) as unknown,
  saveInviteOnlyAction: (...args: unknown[]) => saveInviteOnly(...args) as unknown,
  resetInviteOnlyAction: (...args: unknown[]) => resetInviteOnly(...args) as unknown,
  saveSmtpAction: (...args: unknown[]) => saveSmtp(...args) as unknown,
  resetSmtpAction: (...args: unknown[]) => resetSmtp(...args) as unknown,
}));

const { NameForm } = await import('../../app/console/settings/name-form');
const { RegistrationForm } = await import('../../app/console/settings/registration-form');
const { Pictures } = await import('../../app/console/settings/pictures');
const { SmtpForm } = await import('../../app/console/settings/smtp-form');

beforeEach(() => {
  for (const mock of [saveName, resetName, saveInviteOnly, resetInviteOnly, saveSmtp, resetSmtp]) {
    mock.mockReset();
  }
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('the name form', () => {
  it('starts from the name in force and sends what was typed', async () => {
    saveName.mockResolvedValue({ ok: true, message: 'The name is saved.' });
    render(<NameForm name="Sovereign" source="default" canEdit />);
    const box = screen.getByLabelText('Name') as HTMLInputElement;
    expect(box.value).toBe('Sovereign');
    fireEvent.change(box, { target: { value: 'Acme' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }));
    expect(await screen.findByText('The name is saved.')).toBeTruthy();
    expect((saveName.mock.calls[0]?.[1] as FormData).get('name')).toBe('Acme');
  });

  it('shows a refusal beside the box and leaves what was typed', async () => {
    saveName.mockResolvedValue({
      ok: false,
      error: 'The name must be 1 to 100 characters, on one line.',
    });
    render(<NameForm name="Acme" source="saved" canEdit />);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: ' ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }));
    expect(await screen.findByText(/must be 1 to 100 characters/)).toBeTruthy();
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe(' ');
  });

  it('offers to go back to the default only while a name is saved, and puts it in the box', async () => {
    resetName.mockResolvedValue({ ok: true, message: 'The name is back to the default.' });
    render(<NameForm name="Acme" source="saved" canEdit />);
    fireEvent.click(screen.getByRole('button', { name: 'Use the default' }));
    expect(await screen.findByText('The name is back to the default.')).toBeTruthy();
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Sovereign');
    cleanup();
    render(<NameForm name="Sovereign" source="default" canEdit />);
    expect(screen.queryByRole('button', { name: 'Use the default' })).toBeNull();
  });

  it('offers nothing to someone who may only look', () => {
    render(<NameForm name="Acme" source="saved" canEdit={false} />);
    expect((screen.getByLabelText('Name') as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('the sign-up form', () => {
  it('sends the choice as true or false', async () => {
    saveInviteOnly.mockResolvedValue({
      ok: true,
      message: 'Anyone can sign up without an invitation.',
    });
    render(<RegistrationForm inviteOnly source="default" canEdit />);
    const box = screen.getByRole('checkbox', { name: 'Only people I invite can sign up' });
    expect((box as HTMLInputElement).checked).toBe(true);
    fireEvent.click(box);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Anyone can sign up without an invitation.')).toBeTruthy();
    expect((saveInviteOnly.mock.calls[0]?.[1] as FormData).get('inviteOnly')).toBe('false');
  });

  it('goes back to the server’s setting when it was saved here', async () => {
    resetInviteOnly.mockResolvedValue({
      ok: true,
      message: 'Sign-up follows the server’s setting again.',
    });
    render(<RegistrationForm inviteOnly={false} source="saved" canEdit />);
    fireEvent.click(screen.getByRole('button', { name: 'Use the server’s setting' }));
    expect(await screen.findByText(/follows the server’s setting again/)).toBeTruthy();
  });

  it('offers nothing to someone who may only look', () => {
    render(<RegistrationForm inviteOnly source="environment" canEdit={false} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect((screen.getByRole('checkbox') as HTMLInputElement).disabled).toBe(true);
  });
});

describe('the pictures', () => {
  const none = {
    'logo-light': undefined,
    'logo-dark': undefined,
    favicon: undefined,
    'app-icon': undefined,
    'app-icon-maskable': undefined,
  };
  const png = () => new File([new Uint8Array([1, 2, 3])], 'logo.png', { type: 'image/png' });

  it('sends the file itself to the picture’s address and shows what comes back', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ image: '/api/branding/favicon?v=abc' }), { status: 200 }),
      );
    vi.stubGlobal('fetch', fetchMock);
    render(<Pictures images={none} canEdit />);
    const input = screen.getByLabelText('Favicon') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [png()] } });
    await waitFor(() =>
      expect(screen.getByAltText('Favicon, as set').getAttribute('src')).toBe(
        '/api/branding/favicon?v=abc',
      ),
    );
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/console/branding/favicon');
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(File);
  });

  it('shows the server’s reason beside the picture it concerns, and keeps the old one', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ error: 'unsupported', message: 'Use a PNG, JPEG or WebP picture.' }),
          {
            status: 400,
          },
        ),
      ),
    );
    render(
      <Pictures images={{ ...none, 'logo-light': '/api/branding/logo-light?v=old' }} canEdit />,
    );
    fireEvent.change(screen.getByLabelText('Logo for light pages'), { target: { files: [png()] } });
    expect(await screen.findByText('Use a PNG, JPEG or WebP picture.')).toBeTruthy();
    expect(screen.getByAltText('Logo for light pages, as set').getAttribute('src')).toBe(
      '/api/branding/logo-light?v=old',
    );
  });

  it('says so when the request cannot be made at all', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    render(<Pictures images={none} canEdit />);
    fireEvent.change(screen.getByLabelText('Favicon'), { target: { files: [png()] } });
    expect(await screen.findByText(/Check your connection/)).toBeTruthy();
  });

  it('removes a picture that is set', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ image: null }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<Pictures images={{ ...none, favicon: '/api/branding/favicon?v=a' }} canEdit />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(screen.queryByAltText('Favicon, as set')).toBeNull());
    expect((fetchMock.mock.calls[0] as [string, RequestInit])[1].method).toBe('DELETE');
  });

  it('offers the app icons as PNG only, since a device takes nothing else for one', () => {
    render(<Pictures images={none} canEdit />);
    const accepted = (label: string) =>
      (screen.getByLabelText(label) as HTMLInputElement).getAttribute('accept');
    expect(accepted('App icon')).toBe('image/png');
    expect(accepted('App icon for masking')).toBe('image/png');
    expect(accepted('Favicon')).toContain('image/svg+xml');
  });

  it('sets an app icon like any other picture, to its own address', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ image: '/api/branding/app-icon?v=abc' }), { status: 200 }),
      );
    vi.stubGlobal('fetch', fetchMock);
    render(<Pictures images={none} canEdit />);
    fireEvent.change(screen.getByLabelText('App icon'), { target: { files: [png()] } });
    await waitFor(() =>
      expect(screen.getByAltText('App icon, as set').getAttribute('src')).toBe(
        '/api/branding/app-icon?v=abc',
      ),
    );
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe('/api/console/branding/app-icon');
  });

  it('offers nothing to someone who may only look', () => {
    render(<Pictures images={{ ...none, favicon: '/api/branding/favicon?v=a' }} canEdit={false} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });
});

describe('the mail form', () => {
  const smtp = (overrides: Partial<ShownSmtp> = {}): ShownSmtp => ({
    host: { value: 'mail.example.com', source: 'saved' },
    port: { value: 25, source: 'environment' },
    user: { value: undefined, source: 'unset' },
    from: { value: 'noreply@example.com', source: 'saved' },
    password: { source: 'saved', hasValue: true, unreadable: false },
    ...overrides,
  });

  it('puts only what is saved here in the boxes: a value from the environment is a placeholder', () => {
    render(<SmtpForm smtp={smtp()} encryptionReady />);
    expect((screen.getByLabelText('Mail server') as HTMLInputElement).value).toBe(
      'mail.example.com',
    );
    const port = screen.getByLabelText('Port') as HTMLInputElement;
    expect(port.value).toBe('');
    expect(port.placeholder).toBe('25');
  });

  it('never shows the saved password, and says one is kept', () => {
    render(<SmtpForm smtp={smtp()} encryptionReady />);
    expect((screen.getByLabelText('Password') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Password') as HTMLInputElement).type).toBe('password');
    expect(screen.getByText('A password is saved. Leave this empty to keep it.')).toBeTruthy();
  });

  it('sends what was typed, and empties the password box once saved', async () => {
    saveSmtp.mockResolvedValue({ ok: true, message: 'The email settings are saved.' });
    render(<SmtpForm smtp={smtp()} encryptionReady />);
    fireEvent.change(screen.getByLabelText('Mail server'), {
      target: { value: 'smtp.new.example' },
    });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret-secret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save email settings' }));
    expect(await screen.findByText('The email settings are saved.')).toBeTruthy();
    const sent = saveSmtp.mock.calls[0]?.[1] as FormData;
    expect(sent.get('host')).toBe('smtp.new.example');
    expect(sent.get('password')).toBe('secret-secret');
    expect((screen.getByLabelText('Password') as HTMLInputElement).value).toBe('');
  });

  it('keeps what was typed when it is refused', async () => {
    saveSmtp.mockResolvedValue({ ok: false, error: 'The port is a number from 1 to 65535.' });
    render(<SmtpForm smtp={smtp()} encryptionReady />);
    fireEvent.change(screen.getByLabelText('Port'), { target: { value: '99999' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save email settings' }));
    expect(await screen.findByText('The port is a number from 1 to 65535.')).toBeTruthy();
    expect((screen.getByLabelText('Port') as HTMLInputElement).value).toBe('99999');
  });

  it('removes the saved password only when the box is ticked', async () => {
    saveSmtp.mockResolvedValue({ ok: true, message: 'ok' });
    render(<SmtpForm smtp={smtp()} encryptionReady />);
    fireEvent.click(screen.getByRole('button', { name: 'Save email settings' }));
    await screen.findByText('ok');
    expect((saveSmtp.mock.calls[0]?.[1] as FormData).get('clearPassword')).toBe('');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Remove the saved password' }));
    expect((screen.getByLabelText('Password') as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Save email settings' }));
    await waitFor(() => expect(saveSmtp).toHaveBeenCalledTimes(2));
    expect((saveSmtp.mock.calls[1]?.[1] as FormData).get('clearPassword')).toBe('on');
  });

  it('offers no way to remove a password that is not saved here', () => {
    render(
      <SmtpForm
        smtp={smtp({ password: { source: 'environment', hasValue: true, unreadable: false } })}
        encryptionReady
      />,
    );
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.getByText(/environment supplies a password/)).toBeTruthy();
  });

  it('asks for the password again when the saved one can no longer be read', () => {
    render(
      <SmtpForm
        smtp={smtp({ password: { source: 'saved', hasValue: true, unreadable: true } })}
        encryptionReady
      />,
    );
    expect(screen.getByText(/can no longer be read/)).toBeTruthy();
  });

  it('warns that a password cannot be kept without the encryption keys', () => {
    render(<SmtpForm smtp={smtp()} encryptionReady={false} />);
    expect(screen.getByText(/SV_FIELD_ENCRYPTION_KEYS/)).toBeTruthy();
  });

  it('goes back to the server’s settings only while something is saved here', async () => {
    resetSmtp.mockResolvedValue({
      ok: true,
      message: 'Email follows the server’s settings again.',
    });
    render(<SmtpForm smtp={smtp()} encryptionReady />);
    fireEvent.click(screen.getByRole('button', { name: 'Use the server’s settings' }));
    expect(await screen.findByText(/follows the server’s settings again/)).toBeTruthy();
    expect((screen.getByLabelText('Mail server') as HTMLInputElement).value).toBe('');
    cleanup();
    render(
      <SmtpForm
        smtp={smtp({
          host: { value: undefined, source: 'unset' },
          from: { value: undefined, source: 'unset' },
          password: { source: 'unset', hasValue: false, unreadable: false },
        })}
        encryptionReady
      />,
    );
    expect(screen.queryByRole('button', { name: 'Use the server’s settings' })).toBeNull();
  });
});
