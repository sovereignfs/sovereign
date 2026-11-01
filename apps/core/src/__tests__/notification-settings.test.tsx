// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const setApp = vi.fn();
const clear = vi.fn();
vi.mock('../../app/preferences/notification-actions', () => ({
  setAppNotificationsAction: (...args: unknown[]) => setApp(...args) as unknown,
  clearNotificationsAction: () => clear() as unknown,
}));

const { NotificationSettings } = await import('../../app/preferences/notification-settings');

beforeEach(() => {
  setApp.mockReset().mockResolvedValue({ ok: true, message: 'Off.' });
  clear.mockReset().mockResolvedValue({ ok: true, message: 'Your notifications are cleared.' });
});
afterEach(cleanup);

const APPS = [
  { clientId: 'a', name: 'Reminders', enabled: true },
  { clientId: 'b', name: 'Photos', enabled: false },
];

describe('the notification settings', () => {
  it('lists each app that can write to the person, with its switch in its state', () => {
    render(<NotificationSettings apps={APPS} />);
    const reminders = screen.getByRole('switch', { name: 'Notifications from Reminders' });
    const photos = screen.getByRole('switch', { name: 'Notifications from Photos' });
    expect(reminders.getAttribute('aria-checked')).toBe('true');
    expect(photos.getAttribute('aria-checked')).toBe('false');
  });

  it('says so when no app can', () => {
    render(<NotificationSettings apps={[]} />);
    expect(screen.getByText('No app you use can send you notifications.')).toBeDefined();
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('switches an app off and on, by its id', async () => {
    // Every switch is disabled while a change is being saved. The first save is slow so that this holds when the test reaches the second
    // switch, as it does on a busy machine, instead of by luck.
    setApp.mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(() => resolve({ ok: true, message: 'Off.' }), 100)),
    );
    render(<NotificationSettings apps={APPS} />);
    fireEvent.click(screen.getByRole('switch', { name: 'Notifications from Reminders' }));
    await waitFor(() => expect(setApp).toHaveBeenCalledWith('a', false));
    expect(
      screen
        .getByRole('switch', { name: 'Notifications from Reminders' })
        .getAttribute('aria-checked'),
    ).toBe('false');
    const photos = screen.getByRole('switch', { name: 'Notifications from Photos' });
    await waitFor(() => expect(photos.hasAttribute('disabled')).toBe(false));
    fireEvent.click(photos);
    await waitFor(() => expect(setApp).toHaveBeenCalledWith('b', true));
  });

  it('puts the switch back and says why when core refuses', async () => {
    setApp.mockResolvedValue({ ok: false, error: 'That app cannot send you notifications.' });
    render(<NotificationSettings apps={APPS} />);
    fireEvent.click(screen.getByRole('switch', { name: 'Notifications from Reminders' }));
    expect(await screen.findByText('That app cannot send you notifications.')).toBeDefined();
    expect(
      screen
        .getByRole('switch', { name: 'Notifications from Reminders' })
        .getAttribute('aria-checked'),
    ).toBe('true');
  });

  it('clears everything, and says it did', async () => {
    render(<NotificationSettings apps={APPS} />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear all notifications' }));
    expect(await screen.findByText('Your notifications are cleared.')).toBeDefined();
    expect(clear).toHaveBeenCalledOnce();
  });
});
