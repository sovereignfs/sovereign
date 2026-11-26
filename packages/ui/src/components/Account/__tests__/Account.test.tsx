// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fillUnannounced } from '../../../__tests__/fill-unannounced';
import { ChangePasswordForm } from '../ChangePasswordForm';
import { SessionsPanel } from '../SessionsPanel';

afterEach(cleanup);

describe('SessionsPanel', () => {
  it('ends a session through the app’s action, by its id, and offers ending the others only when there are some', async () => {
    const endSession = vi
      .fn()
      .mockResolvedValue({ ok: false, error: 'That session has already ended.' });
    const endOthers = vi
      .fn()
      .mockResolvedValue({ ok: true, message: 'Signed out of 1 other session.' });
    render(
      <SessionsPanel
        sessions={[
          {
            id: 'a',
            current: true,
            device: 'Safari on iOS',
            ipAddress: null,
            signedInAt: 0,
            lastActiveAt: 0,
          },
          {
            id: 'b',
            current: false,
            device: 'Chrome on macOS',
            ipAddress: null,
            signedInAt: 0,
            lastActiveAt: 0,
          },
        ]}
        endSession={endSession}
        endOthers={endOthers}
      />,
    );
    expect(screen.getByText('Safari on iOS (this device)')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(endSession).toHaveBeenCalled());
    expect(endSession.mock.calls[0]?.[0]).toBe('b');
    expect(await screen.findByText('That session has already ended.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out everywhere else' }));
    expect(await screen.findByText('Signed out of 1 other session.')).toBeTruthy();
  });

  it('writes times in the zone it is given, never in the runtime’s, so the server and the browser agree', () => {
    // The server and the browser run in different zones and languages: neither may show through.
    const zone = process.env.TZ;
    process.env.TZ = 'America/New_York';
    try {
      const session = {
        id: 'a',
        current: false,
        device: 'Chrome on macOS',
        ipAddress: null,
        signedInAt: 0,
        lastActiveAt: 0,
      };
      const noop = vi.fn();
      const { rerender } = render(
        <SessionsPanel sessions={[session]} endSession={noop} endOthers={noop} />,
      );
      expect(
        screen.getByText('Signed in 1 Jan 1970, 00:00. Last active 1 Jan 1970, 00:00.'),
      ).toBeTruthy();
      rerender(
        <SessionsPanel
          sessions={[session]}
          endSession={noop}
          endOthers={noop}
          timeZone="Asia/Tokyo"
        />,
      );
      expect(
        screen.getByText('Signed in 1 Jan 1970, 09:00. Last active 1 Jan 1970, 09:00.'),
      ).toBeTruthy();
      rerender(
        <SessionsPanel
          sessions={[session]}
          endSession={noop}
          endOthers={noop}
          timeZone="Not/AZone"
        />,
      );
      expect(screen.getByText(/Signed in 1 Jan 1970, 00:00/)).toBeTruthy();
    } finally {
      if (zone === undefined) delete process.env.TZ;
      else process.env.TZ = zone;
    }
  });
});

describe('ChangePasswordForm', () => {
  it('hands over both passwords, and empties the boxes once changed', () => {
    const onSubmit = vi.fn();
    const { rerender } = render(<ChangePasswordForm onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText(/Current password/), { target: { value: 'old' } });
    fireEvent.change(screen.getByLabelText(/New password/), { target: { value: 'new' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Change password' }));
    expect(onSubmit).toHaveBeenCalledWith({ current: 'old', next: 'new' });
    rerender(<ChangePasswordForm done onSubmit={onSubmit} />);
    expect(screen.getByText(/Your password is changed/)).toBeTruthy();
    expect((screen.getByLabelText(/Current password/) as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText(/New password/) as HTMLInputElement).value).toBe('');
  });

  it('hands over and later empties boxes that were filled without a word to the page', () => {
    const onSubmit = vi.fn();
    const { rerender } = render(<ChangePasswordForm onSubmit={onSubmit} />);
    const box = (label: RegExp) => screen.getByLabelText(label) as HTMLInputElement;
    fillUnannounced(box(/Current password/), 'old');
    fillUnannounced(box(/New password/), 'new');
    fireEvent.submit(screen.getByRole('button', { name: 'Change password' }));
    expect(onSubmit).toHaveBeenCalledWith({ current: 'old', next: 'new' });
    rerender(<ChangePasswordForm pending onSubmit={onSubmit} />);
    rerender(<ChangePasswordForm error="Try again." onSubmit={onSubmit} />);
    expect(box(/Current password/).value).toBe('old');
    expect(box(/New password/).value).toBe('new');
    rerender(<ChangePasswordForm done onSubmit={onSubmit} />);
    expect(box(/Current password/).value).toBe('');
    expect(box(/New password/).value).toBe('');
  });
});
