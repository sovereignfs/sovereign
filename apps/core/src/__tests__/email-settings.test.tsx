// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const setApp = vi.fn();
vi.mock('../../app/preferences/email-actions', () => ({
  setAppEmailAction: (...args: unknown[]) => setApp(...args) as unknown,
}));

const { EmailSettings } = await import('../../app/preferences/email-settings');

beforeEach(() => setApp.mockReset().mockResolvedValue({ ok: true, message: 'Off.' }));
afterEach(cleanup);

const APPS = [
  { clientId: 'a', name: 'Reminders', enabled: true },
  { clientId: 'b', name: 'Photos', enabled: false },
];
const switchOf = (name: string) => screen.getByRole('switch', { name });

describe('the email settings', () => {
  it('lists each app that can email the person, with its switch in its state', () => {
    render(<EmailSettings apps={APPS} />);
    expect(switchOf('Email from Reminders').getAttribute('aria-checked')).toBe('true');
    expect(switchOf('Email from Photos').getAttribute('aria-checked')).toBe('false');
  });

  it('says that the apps do not learn the address', () => {
    render(<EmailSettings apps={APPS} />);
    expect(screen.getByText(/without knowing your address/)).toBeDefined();
  });

  it('switches an app off and on, by its id', async () => {
    render(<EmailSettings apps={APPS} />);
    fireEvent.click(switchOf('Email from Reminders'));
    await waitFor(() => expect(setApp).toHaveBeenCalledWith('a', false));
    expect(switchOf('Email from Reminders').getAttribute('aria-checked')).toBe('false');
    fireEvent.click(switchOf('Email from Photos'));
    await waitFor(() => expect(setApp).toHaveBeenCalledWith('b', true));
  });

  it('puts the switch back and says why when core refuses', async () => {
    setApp.mockResolvedValue({ ok: false, error: 'That app cannot email you.' });
    render(<EmailSettings apps={APPS} />);
    fireEvent.click(switchOf('Email from Reminders'));
    expect(await screen.findByText('That app cannot email you.')).toBeDefined();
    expect(switchOf('Email from Reminders').getAttribute('aria-checked')).toBe('true');
  });
});
