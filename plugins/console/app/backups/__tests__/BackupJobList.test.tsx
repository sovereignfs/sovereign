// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { BackupJobStatus } from '../actions';
import { type BackupJobView, BackupJobList } from '../BackupJobList';

const getInstanceBackupJobStatusAction = vi.fn();
vi.mock('../actions', () => ({
  getInstanceBackupJobStatusAction: (...args: unknown[]) =>
    getInstanceBackupJobStatusAction(...args),
}));

function job(overrides: Partial<BackupJobView> = {}): BackupJobView {
  return {
    id: 'job-1',
    status: 'queued',
    sizeBytes: 0,
    errorMessage: null,
    downloadUrl: null,
    pushStatus: null,
    pushError: null,
    createdAt: 1_700_000_000,
    ...overrides,
  };
}

/**
 * `getInstanceBackupJobStatusAction`'s real return shape keys on `jobId`,
 * not `id` (`BackupJobStatus`, distinct from the `BackupJobView` list-item
 * shape `job()` above produces) — the component's poll-merge matches on
 * `result.jobId === job.id`, so a mocked response missing `jobId` never
 * matches anything and the component (correctly) never updates, which reads
 * exactly like a stuck poll if this fixture gets it wrong.
 */
function pollResponse(overrides: Partial<BackupJobStatus> = {}): BackupJobStatus {
  return {
    jobId: 'job-1',
    status: 'running',
    sizeBytes: 0,
    errorMessage: null,
    downloadUrl: null,
    pushStatus: null,
    pushError: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('BackupJobList', () => {
  it('shows an empty state when there are no jobs', () => {
    render(<BackupJobList initialJobs={[]} />);
    expect(screen.getByText('No backups yet')).toBeTruthy();
  });

  it('shows a download button for a complete job', () => {
    render(
      <BackupJobList
        initialJobs={[
          job({
            status: 'complete',
            sizeBytes: 2048,
            downloadUrl: '/api/backup-jobs/job-1/download/tok',
          }),
        ]}
      />,
    );
    expect(screen.getByRole('button', { name: 'Download' })).toBeTruthy();
  });

  it('shows no download button for a job that is not complete', () => {
    render(<BackupJobList initialJobs={[job({ status: 'running' })]} />);
    expect(screen.queryByRole('button', { name: 'Download' })).toBeNull();
  });

  it('polls an in-flight job and reflects a transition to complete', async () => {
    let pollCount = 0;
    getInstanceBackupJobStatusAction.mockImplementation(() => {
      pollCount += 1;
      if (pollCount < 2) {
        return Promise.resolve(pollResponse({ status: 'running' }));
      }
      return Promise.resolve(
        pollResponse({
          status: 'complete',
          sizeBytes: 4096,
          downloadUrl: '/api/backup-jobs/job-1/download/tok',
        }),
      );
    });

    render(<BackupJobList initialJobs={[job({ status: 'running' })]} />);

    await vi.advanceTimersByTimeAsync(3000);
    await waitFor(() => expect(getInstanceBackupJobStatusAction).toHaveBeenCalledTimes(1));

    await vi.advanceTimersByTimeAsync(3000);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Download' })).toBeTruthy());
    expect(getInstanceBackupJobStatusAction).toHaveBeenCalledTimes(2);
  });

  it('stops polling once every job has settled', async () => {
    getInstanceBackupJobStatusAction.mockResolvedValue(
      pollResponse({ status: 'failed', errorMessage: 'boom' }),
    );

    render(<BackupJobList initialJobs={[job({ status: 'running' })]} />);

    await vi.advanceTimersByTimeAsync(3000);
    await waitFor(() => expect(screen.getByText(/boom/)).toBeTruthy());

    const callsBefore = getInstanceBackupJobStatusAction.mock.calls.length;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(getInstanceBackupJobStatusAction.mock.calls.length).toBe(callsBefore);
  });

  /**
   * `BackupTriggerForm`'s `router.refresh()` after a successful enqueue
   * re-runs the page's Server Component and hands this component a fresh
   * `initialJobs` array (new reference) that now includes the newly-created
   * job — this must actually show up, not be frozen out by a `useState`
   * initializer that only reads its argument once on mount.
   */
  it('resyncs its displayed jobs when the initialJobs prop changes', () => {
    const { rerender } = render(<BackupJobList initialJobs={[job({ id: 'job-1' })]} />);
    expect(screen.queryByText(/job-2/)).toBeNull();

    rerender(
      <BackupJobList
        initialJobs={[job({ id: 'job-2', createdAt: 1_700_000_100 }), job({ id: 'job-1' })]}
      />,
    );

    // Two distinct job rows now render — the list re-adopted the new prop's
    // second entry rather than staying frozen on the single job it mounted with.
    expect(screen.getAllByText('queued')).toHaveLength(2);
  });
});
