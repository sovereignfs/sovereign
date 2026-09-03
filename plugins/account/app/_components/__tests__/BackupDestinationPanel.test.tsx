// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ActionResult } from '../../data/actions';
import { BackupDestinationPanel } from '../BackupDestinationPanel';

const connectBackupDestinationAction = vi.fn();
vi.mock('../../data/actions', () => ({
  connectBackupDestinationAction: (...args: unknown[]) => connectBackupDestinationAction(...args),
}));

const generateIdentity = vi.fn();
const identityToRecipient = vi.fn();
vi.mock('age-encryption', () => ({
  generateIdentity: () => generateIdentity(),
  identityToRecipient: (identity: string) => identityToRecipient(identity),
}));

const FAKE_IDENTITY =
  'AGE-SECRET-KEY-1QQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQ';
const FAKE_RECIPIENT =
  'age1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq';

beforeEach(() => {
  vi.clearAllMocks();
  generateIdentity.mockResolvedValue(FAKE_IDENTITY);
  identityToRecipient.mockResolvedValue(FAKE_RECIPIENT);
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:fake'),
    revokeObjectURL: vi.fn(),
  });
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function generateKey() {
  fireEvent.click(screen.getByRole('button', { name: 'Generate a backup key' }));
  await waitFor(() => expect(screen.getByDisplayValue(FAKE_IDENTITY)).toBeTruthy());
}

function fillDestinationForm() {
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'My backup repo' } });
  fireEvent.change(screen.getByLabelText('Repository URL'), {
    target: { value: 'https://git.example.com/me/backups.git' },
  });
  fireEvent.change(screen.getByLabelText(/Access token/), { target: { value: 'ghp_test' } });
}

function isDisabled(labelText: string | RegExp): boolean {
  return (screen.getByLabelText(labelText) as HTMLInputElement | HTMLTextAreaElement).disabled;
}

describe('BackupDestinationPanel — backup key generation', () => {
  it('does not generate or reveal a key until the user asks for it', () => {
    render(<BackupDestinationPanel />);
    expect(screen.queryByText(/Save this key now/)).toBeNull();
    expect(generateIdentity).not.toHaveBeenCalled();
  });

  it('reveals the key after generation and requires explicit confirmation before it can be used', async () => {
    render(<BackupDestinationPanel />);
    await generateKey();

    expect(screen.getByText(/Save this key now/)).toBeTruthy();
    fillDestinationForm();
    expect(
      (screen.getByRole('button', { name: 'Connect destination' }) as HTMLButtonElement).disabled,
    ).toBe(true);

    fireEvent.click(screen.getByLabelText("I've saved my backup key somewhere safe"));
    expect(
      (screen.getByRole('button', { name: 'Connect destination' }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it('downloads the key as a file without throwing', async () => {
    render(<BackupDestinationPanel />);
    await generateKey();
    expect(() => fireEvent.click(screen.getByRole('button', { name: 'Download' }))).not.toThrow();
    expect(URL.createObjectURL).toHaveBeenCalled();
  });

  it('copies the key to the clipboard', async () => {
    render(<BackupDestinationPanel />);
    await generateKey();
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(FAKE_IDENTITY));
  });

  it('generating a new key resets the "saved it" confirmation', async () => {
    render(<BackupDestinationPanel />);
    await generateKey();
    fireEvent.click(screen.getByLabelText("I've saved my backup key somewhere safe"));
    expect(
      (screen.getByLabelText("I've saved my backup key somewhere safe") as HTMLInputElement)
        .checked,
    ).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Generate a new one' }));
    await waitFor(() => expect(generateIdentity).toHaveBeenCalledTimes(2));

    expect(
      (screen.getByLabelText("I've saved my backup key somewhere safe") as HTMLInputElement)
        .checked,
    ).toBe(false);
  });
});

describe('BackupDestinationPanel — using an existing key', () => {
  it('lets the user paste a recipient without generating a new key, and enables the submit button immediately', () => {
    render(<BackupDestinationPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'paste one you already have' }));
    fillDestinationForm();
    fireEvent.change(screen.getByLabelText('Backup key (public part)'), {
      target: { value: FAKE_RECIPIENT },
    });
    expect(
      (screen.getByRole('button', { name: 'Connect destination' }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });
});

describe('BackupDestinationPanel — connecting a destination', () => {
  it('shows a success message and calls onConnected once on a successful submission', async () => {
    connectBackupDestinationAction.mockResolvedValue({
      ok: true,
      message: 'Backup destination connected.',
    });
    const onConnected = vi.fn();
    render(<BackupDestinationPanel onConnected={onConnected} />);
    await generateKey();
    fillDestinationForm();
    fireEvent.click(screen.getByLabelText("I've saved my backup key somewhere safe"));
    fireEvent.click(screen.getByRole('button', { name: 'Connect destination' }));

    await waitFor(() => expect(onConnected).toHaveBeenCalledTimes(1));
    expect(screen.getByText('Backup destination connected.')).toBeTruthy();
  });

  it('shows the inline error and does not call onConnected on a failed submission', async () => {
    connectBackupDestinationAction.mockResolvedValue({
      ok: false,
      error: 'Could not connect that destination. Check the details and try again.',
    });
    const onConnected = vi.fn();
    render(<BackupDestinationPanel onConnected={onConnected} />);
    await generateKey();
    fillDestinationForm();
    fireEvent.click(screen.getByLabelText("I've saved my backup key somewhere safe"));
    fireEvent.click(screen.getByRole('button', { name: 'Connect destination' }));

    await waitFor(() =>
      expect(
        screen.getByText('Could not connect that destination. Check the details and try again.'),
      ).toBeTruthy(),
    );
    expect(onConnected).not.toHaveBeenCalled();
  });

  /**
   * Regression guard for the exact bug class recorded in this repo's history
   * for an analogous `onAdded` prop (`AddProviderForm`, 0.112.3): re-passing
   * a new callback identity with no new submission must not replay the
   * success state or re-call the callback.
   */
  it('does not re-call onConnected when only the onConnected prop identity changes', async () => {
    connectBackupDestinationAction.mockResolvedValue({
      ok: true,
      message: 'Backup destination connected.',
    });
    const onConnectedFirst = vi.fn();
    const { rerender } = render(<BackupDestinationPanel onConnected={onConnectedFirst} />);
    await generateKey();
    fillDestinationForm();
    fireEvent.click(screen.getByLabelText("I've saved my backup key somewhere safe"));
    fireEvent.click(screen.getByRole('button', { name: 'Connect destination' }));
    await waitFor(() => expect(onConnectedFirst).toHaveBeenCalledTimes(1));

    const onConnectedSecond = vi.fn();
    rerender(<BackupDestinationPanel onConnected={onConnectedSecond} />);

    expect(onConnectedSecond).not.toHaveBeenCalled();
    expect(onConnectedFirst).toHaveBeenCalledTimes(1);
  });

  it('disables the destination form fields while the submission is pending', async () => {
    let resolveAction!: (value: ActionResult) => void;
    connectBackupDestinationAction.mockImplementation(
      () =>
        new Promise<ActionResult>((resolve) => {
          resolveAction = resolve;
        }),
    );
    render(<BackupDestinationPanel />);
    await generateKey();
    fillDestinationForm();
    fireEvent.click(screen.getByLabelText("I've saved my backup key somewhere safe"));
    fireEvent.click(screen.getByRole('button', { name: 'Connect destination' }));

    await waitFor(() => expect(isDisabled('Name')).toBe(true));
    expect(isDisabled('Repository URL')).toBe(true);
    expect(isDisabled(/Access token/)).toBe(true);

    resolveAction({ ok: true, message: 'Backup destination connected.' });

    await waitFor(() => expect(isDisabled('Name')).toBe(false));
  });
});
