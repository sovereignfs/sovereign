// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const updateUser = vi.fn();
vi.mock('../auth/client', () => ({
  authClient: { updateUser: (input: unknown) => updateUser(input) as unknown },
}));

const { PreferencesPanel } = await import('../../app/preferences/preferences-panel');

const timezones = [
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo' },
  { value: 'Europe/Paris', label: 'Europe/Paris' },
];
const locales = [
  { value: 'fr-FR', label: 'French (France) (fr-FR)' },
  { value: 'ja-JP', label: 'Japanese (Japan) (ja-JP)' },
];

beforeEach(() => updateUser.mockReset().mockResolvedValue({ data: {}, error: null }));
afterEach(() => cleanup());

const show = (timezone = '', locale = '') =>
  render(
    <PreferencesPanel
      timezone={timezone}
      locale={locale}
      timezones={timezones}
      locales={locales}
    />,
  );
const zone = () => screen.getByLabelText('Time zone') as HTMLSelectElement;
const language = () => screen.getByLabelText('Language and region') as HTMLSelectElement;
const save = () => fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }));

describe('the preferences panel', () => {
  it('starts on what is saved', () => {
    show('Europe/Paris', 'ja-JP');
    expect(zone().value).toBe('Europe/Paris');
    expect(language().value).toBe('ja-JP');
  });

  it('sends both choices and says they are saved', async () => {
    show();
    fireEvent.change(zone(), { target: { value: 'Asia/Tokyo' } });
    fireEvent.change(language(), { target: { value: 'fr-FR' } });
    save();
    expect(await screen.findByText('Your preferences are saved.')).toBeTruthy();
    expect(updateUser).toHaveBeenCalledWith({ timezone: 'Asia/Tokyo', locale: 'fr-FR' });
  });

  it('saves "Not set" as nothing, so a saved value can be taken back', async () => {
    show('Europe/Paris', 'fr-FR');
    fireEvent.change(zone(), { target: { value: '' } });
    fireEvent.change(language(), { target: { value: '' } });
    save();
    await screen.findByText('Your preferences are saved.');
    expect(updateUser).toHaveBeenCalledWith({ timezone: null, locale: null });
  });

  it('takes "saved" back once something is changed again', async () => {
    show();
    save();
    await screen.findByText('Your preferences are saved.');
    fireEvent.change(zone(), { target: { value: 'Asia/Tokyo' } });
    expect(screen.queryByText('Your preferences are saved.')).toBeNull();
  });

  it('shows the server’s words when it refuses a choice, and keeps the choices', async () => {
    updateUser.mockResolvedValue({
      data: null,
      error: { status: 400, code: 'INVALID_TIMEZONE', message: 'The time zone is not one.' },
    });
    show();
    fireEvent.change(zone(), { target: { value: 'Asia/Tokyo' } });
    save();
    expect((await screen.findByRole('alert')).textContent).toContain('The time zone is not one.');
    expect(zone().value).toBe('Asia/Tokyo');
  });

  it('says to wait when the limit is reached, and plainly for anything else', async () => {
    updateUser.mockResolvedValueOnce({ data: null, error: { status: 429 } });
    show();
    save();
    expect(await screen.findByText(/Too many attempts/)).toBeTruthy();
    updateUser.mockResolvedValueOnce({
      data: null,
      error: { status: 500, message: 'SQLITE_BUSY' },
    });
    save();
    expect(await screen.findByText(/could not be saved/)).toBeTruthy();
    expect(screen.queryByText(/SQLITE/)).toBeNull();
  });

  it('can pick the browser’s own time zone when the list has it', () => {
    vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(
      () => ({ resolvedOptions: () => ({ timeZone: 'Asia/Tokyo' }) }) as Intl.DateTimeFormat,
    );
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Use this browser’s time zone' }));
    expect(zone().value).toBe('Asia/Tokyo');
    vi.restoreAllMocks();
  });

  it('leaves the choice alone when the browser’s zone is not in the list', () => {
    vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(
      () => ({ resolvedOptions: () => ({ timeZone: 'Mars/Phobos' }) }) as Intl.DateTimeFormat,
    );
    show('Europe/Paris');
    fireEvent.click(screen.getByRole('button', { name: 'Use this browser’s time zone' }));
    expect(zone().value).toBe('Europe/Paris');
    vi.restoreAllMocks();
  });
});
