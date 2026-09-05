// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ToastProvider } from '@sovereignfs/ui';
import type { TriggerResult } from '../actions';
import { BackupTriggerForm } from '../BackupTriggerForm';

const triggerInstanceBackupAction = vi.fn();
vi.mock('../actions', () => ({
  triggerInstanceBackupAction: (...args: unknown[]) => triggerInstanceBackupAction(...args),
}));

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

const PLUGINS = [
  { id: 'fs.sovereign.warden', name: 'Warden' },
  { id: 'fs.sovereign.tasks', name: 'Tasks' },
];

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

function renderForm(gitPushAvailable = false) {
  return render(
    <ToastProvider>
      <BackupTriggerForm excludablePlugins={PLUGINS} gitPushAvailable={gitPushAvailable} />
    </ToastProvider>,
  );
}

describe('BackupTriggerForm', () => {
  it('renders one checkbox per excludable plugin', () => {
    renderForm();
    // getByLabelText throws if not found — reaching the assertion at all is the check.
    expect(screen.getByLabelText('Warden')).toBeTruthy();
    expect(screen.getByLabelText('Tasks')).toBeTruthy();
  });

  it('hides the Git-push checkbox when gitPushAvailable is false', () => {
    renderForm(false);
    expect(screen.queryByText('Also push to the configured Git remote')).toBeNull();
  });

  it('shows the Git-push checkbox when gitPushAvailable is true', () => {
    renderForm(true);
    expect(screen.getByText('Also push to the configured Git remote')).toBeTruthy();
  });

  it('submits the passphrase, shows a success toast, and refreshes the router', async () => {
    triggerInstanceBackupAction.mockResolvedValue({
      ok: true,
      jobId: 'job-1',
    } satisfies TriggerResult);
    renderForm();

    fireEvent.change(screen.getByLabelText('Passphrase'), {
      target: { value: 'correct horse battery staple' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Back up now' }));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(screen.getByText('Backup started — see the list below for status.')).toBeTruthy();
  });

  it('shows the error message on a failed submission', async () => {
    triggerInstanceBackupAction.mockResolvedValue({
      ok: false,
      error: 'Something went wrong on the server.',
    } satisfies TriggerResult);
    renderForm();

    // A real passphrase is required here too — the input's own `required`
    // attribute blocks native submission (and the mocked action is never
    // reached) for an empty field, before this test ever gets to exercise
    // the *server*-reported failure path it's actually testing.
    fireEvent.change(screen.getByLabelText('Passphrase'), {
      target: { value: 'correct horse battery staple' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Back up now' }));

    await waitFor(() =>
      expect(screen.getByText('Something went wrong on the server.')).toBeTruthy(),
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  /**
   * Same class of regression `AddProviderForm.test.tsx` (plugins/warden)
   * guards — the fields must reflect a submission in flight, not stay
   * editable with only the submit button showing pending.
   */
  it('disables the passphrase field and checkboxes while the submission is pending', async () => {
    let resolveAction!: (value: TriggerResult) => void;
    triggerInstanceBackupAction.mockImplementation(
      () =>
        new Promise<TriggerResult>((resolve) => {
          resolveAction = resolve;
        }),
    );
    renderForm(true);

    fireEvent.change(screen.getByLabelText('Passphrase'), {
      target: { value: 'correct horse battery staple' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Back up now' }));

    await waitFor(() =>
      expect((screen.getByLabelText('Passphrase') as HTMLInputElement).disabled).toBe(true),
    );
    expect((screen.getByLabelText('Warden') as HTMLInputElement).disabled).toBe(true);

    resolveAction({ ok: true, jobId: 'job-1' });

    await waitFor(() =>
      expect((screen.getByLabelText('Passphrase') as HTMLInputElement).disabled).toBe(false),
    );
  });
});
