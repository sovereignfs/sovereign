// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const changePassword = vi.fn();
vi.mock('../auth/client', () => ({
  authClient: { changePassword: (input: unknown) => changePassword(input) as unknown },
}));
const endSessionAction = vi.fn();
const endOtherSessionsAction = vi.fn();
vi.mock('../../app/security/actions', () => ({
  endSessionAction: (...args: unknown[]) => endSessionAction(...args) as unknown,
  endOtherSessionsAction: (...args: unknown[]) => endOtherSessionsAction(...args) as unknown,
}));

const { ChangePasswordForm } = await import('../../app/security/change-password-form');
const { SessionsPanel } = await import('../../app/security/sessions-panel');

beforeEach(() => {
  changePassword.mockReset();
  endSessionAction.mockReset().mockResolvedValue({ ok: true });
  endOtherSessionsAction
    .mockReset()
    .mockResolvedValue({ ok: true, message: 'Ended 1 other session.' });
});
afterEach(cleanup);

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(new RegExp(`^${label}`)), { target: { value } });

describe('the change password form', () => {
  const submit = () => {
    type('Current password', 'correct horse battery');
    type('New password', 'a different long passphrase');
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
  };

  it('sends both passwords and asks for every other session to end, then says so', async () => {
    changePassword.mockResolvedValue({ data: {}, error: null });
    render(<ChangePasswordForm />);
    submit();
    expect(await screen.findByText(/signed out everywhere else/)).toBeTruthy();
    expect(changePassword).toHaveBeenCalledWith({
      currentPassword: 'correct horse battery',
      newPassword: 'a different long passphrase',
      revokeOtherSessions: true,
    });
    expect((screen.getByLabelText(/^Current password/) as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText(/^New password/) as HTMLInputElement).value).toBe('');
  });

  it('says the current password is wrong, and keeps what was typed', async () => {
    changePassword.mockResolvedValue({
      data: null,
      error: { status: 400, code: 'INVALID_PASSWORD' },
    });
    render(<ChangePasswordForm />);
    submit();
    expect((await screen.findByRole('alert')).textContent).toContain(
      'current password is not right',
    );
    expect((screen.getByLabelText(/^New password/) as HTMLInputElement).value).toBe(
      'a different long passphrase',
    );
  });

  it('shows the server’s words when the new password breaks the rules', async () => {
    changePassword.mockResolvedValue({
      data: null,
      error: {
        status: 400,
        code: 'PASSWORD_DOES_NOT_MEET_POLICY',
        message: 'The password must include a number.',
      },
    });
    render(<ChangePasswordForm />);
    submit();
    expect(await screen.findByText('The password must include a number.')).toBeTruthy();
    expect(screen.queryByText(/signed out everywhere else/)).toBeNull();
  });

  it('says to wait when the limit is reached, and plainly for anything else', async () => {
    changePassword.mockResolvedValueOnce({ data: null, error: { status: 429 } });
    render(<ChangePasswordForm />);
    submit();
    expect(await screen.findByText(/Too many attempts/)).toBeTruthy();
    changePassword.mockResolvedValueOnce({
      data: null,
      error: { status: 500, message: 'SQLITE_BUSY' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByText(/could not be changed/)).toBeTruthy();
    expect(screen.queryByText(/SQLITE/)).toBeNull();
  });
});

const T = Date.UTC(2026, 9, 1, 9, 0);
const sessions = [
  {
    id: 's1',
    current: true,
    device: 'Chrome on macOS',
    ipAddress: '203.0.113.5',
    signedInAt: T,
    lastActiveAt: T,
  },
  {
    id: 's2',
    current: false,
    device: 'Firefox on Windows',
    ipAddress: null,
    signedInAt: T,
    lastActiveAt: T,
  },
];

describe('the sessions panel', () => {
  it('lists each session by device, marking the one in use', () => {
    render(<SessionsPanel sessions={sessions} />);
    expect(screen.getByText('Chrome on macOS (this device)')).toBeTruthy();
    expect(screen.getByText('Firefox on Windows')).toBeTruthy();
    expect(screen.getByText(/203\.0\.113\.5/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign out of this device' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy();
  });

  it('ends a session by its id, through the server action', async () => {
    render(<SessionsPanel sessions={sessions} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(endSessionAction).toHaveBeenCalled());
    expect(endSessionAction.mock.calls[0]?.[0]).toBe('s2');
  });

  it('ends the others in one step, and says how many', async () => {
    render(<SessionsPanel sessions={sessions} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign out everywhere else' }));
    expect(await screen.findByText('Ended 1 other session.')).toBeTruthy();
  });

  it('offers no "everywhere else" when this is the only session', () => {
    render(<SessionsPanel sessions={[sessions[0] as (typeof sessions)[number]]} />);
    expect(screen.queryByRole('button', { name: 'Sign out everywhere else' })).toBeNull();
  });

  it('says so, beside the session, when it had already ended', async () => {
    endSessionAction.mockResolvedValue({ ok: false, error: 'That session has already ended.' });
    render(<SessionsPanel sessions={sessions} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByText('That session has already ended.')).toBeTruthy();
  });
});
