// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PortabilityPanel } from '../PortabilityPanel';

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 400): Response {
  return {
    ok,
    status,
    json: async () => body,
    blob: async () => new Blob([JSON.stringify(body)]),
  } as unknown as Response;
}

function mockFetchRouter(handlers: Record<string, (init?: RequestInit) => Response>) {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    for (const [prefix, handler] of Object.entries(handlers)) {
      if (url.includes(prefix)) return Promise.resolve(handler(init));
    }
    throw new Error(`Unhandled fetch: ${url}`);
  });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('PortabilityPanel — Full backup', () => {
  it('loads and shows a checkbox per installed plugin', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchRouter({
        '/api/plugins': () =>
          jsonResponse({
            plugins: [
              { id: 'com.example.notes', name: 'Notes' },
              { id: 'com.example.tasks', name: 'Tasks' },
            ],
          }),
      }),
    );
    render(<PortabilityPanel />);
    await waitFor(() => expect(screen.getByLabelText('Notes')).toBeTruthy());
    expect(screen.getByLabelText('Tasks')).toBeTruthy();
  });

  it('rejects a short passphrase without starting a backup', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchRouter({ '/api/plugins': () => jsonResponse({ plugins: [] }) }),
    );
    render(<PortabilityPanel />);

    fireEvent.change(screen.getByLabelText('Passphrase'), { target: { value: 'short' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start full backup' }));

    await waitFor(() => expect(screen.getByText(/at least 8 characters/)).toBeTruthy());
  });

  it('starts a backup, polls until complete, and shows a download button', async () => {
    const enqueue = vi.fn(() => jsonResponse({ jobId: 'job-1' }, true, 202));
    let pollCount = 0;
    const poll = vi.fn(() => {
      pollCount += 1;
      if (pollCount < 2) {
        return jsonResponse({
          jobId: 'job-1',
          status: 'running',
          sizeBytes: 0,
          errorMessage: null,
          downloadUrl: null,
        });
      }
      return jsonResponse({
        jobId: 'job-1',
        status: 'complete',
        sizeBytes: 2 * 1024 * 1024,
        errorMessage: null,
        downloadUrl: '/api/backup-jobs/job-1/download/tok',
      });
    });
    vi.stubGlobal(
      'fetch',
      mockFetchRouter({
        '/api/plugins': () => jsonResponse({ plugins: [] }),
        '/api/account/backup-jobs/job-1': poll,
        '/api/account/backup-jobs': enqueue,
      }),
    );

    render(<PortabilityPanel />);
    fireEvent.change(screen.getByLabelText('Passphrase'), {
      target: { value: 'correct horse battery staple' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Start full backup' }));

    await waitFor(() => expect(enqueue).toHaveBeenCalledTimes(1));
    const [init] = enqueue.mock.calls[0] as unknown as [RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      passphrase: 'correct horse battery staple',
      includeFiles: true,
      excludePluginIds: [],
    });

    // The passphrase field clears immediately after a successful enqueue.
    expect((screen.getByLabelText('Passphrase') as HTMLInputElement).value).toBe('');

    await vi.advanceTimersByTimeAsync(3000);
    await waitFor(() => expect(screen.getByText(/Preparing your backup/)).toBeTruthy());

    await vi.advanceTimersByTimeAsync(3000);
    await waitFor(() => expect(screen.getByText('Backup ready')).toBeTruthy());
    expect(screen.getByText(/2\.0 MB/)).toBeTruthy();
    expect(poll).toHaveBeenCalledTimes(2);
  });

  it('shows the server-provided error and stops polling on a failed job', async () => {
    const poll = vi.fn(() =>
      jsonResponse({
        jobId: 'job-1',
        status: 'failed',
        sizeBytes: 0,
        errorMessage: 'Something went wrong upstream.',
        downloadUrl: null,
      }),
    );
    vi.stubGlobal(
      'fetch',
      mockFetchRouter({
        '/api/plugins': () => jsonResponse({ plugins: [] }),
        '/api/account/backup-jobs/job-1': poll,
        '/api/account/backup-jobs': () => jsonResponse({ jobId: 'job-1' }, true, 202),
      }),
    );

    render(<PortabilityPanel />);
    fireEvent.change(screen.getByLabelText('Passphrase'), {
      target: { value: 'correct horse battery staple' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Start full backup' }));

    await vi.advanceTimersByTimeAsync(3000);
    await waitFor(() => expect(screen.getByText('Backup failed')).toBeTruthy());
    expect(screen.getByText('Something went wrong upstream.')).toBeTruthy();

    const callsBefore = poll.mock.calls.length;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(poll.mock.calls.length).toBe(callsBefore); // stopped polling
  });

  it('shows an inline error when the server rejects the enqueue request', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchRouter({
        '/api/plugins': () => jsonResponse({ plugins: [] }),
        '/api/account/backup-jobs': () =>
          jsonResponse({ error: 'Passphrase must be at least 8 characters.' }, false, 400),
      }),
    );
    render(<PortabilityPanel />);
    fireEvent.change(screen.getByLabelText('Passphrase'), {
      target: { value: 'correct horse battery staple' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Start full backup' }));

    await waitFor(() =>
      expect(screen.getByText('Passphrase must be at least 8 characters.')).toBeTruthy(),
    );
  });

  it('unchecking a plugin excludes it from the request', async () => {
    const enqueue = vi.fn(() => jsonResponse({ jobId: 'job-1' }, true, 202));
    vi.stubGlobal(
      'fetch',
      mockFetchRouter({
        '/api/plugins': () =>
          jsonResponse({ plugins: [{ id: 'com.example.notes', name: 'Notes' }] }),
        '/api/account/backup-jobs/job-1': () =>
          jsonResponse({
            jobId: 'job-1',
            status: 'running',
            sizeBytes: 0,
            errorMessage: null,
            downloadUrl: null,
          }),
        '/api/account/backup-jobs': enqueue,
      }),
    );

    render(<PortabilityPanel />);
    await waitFor(() => expect(screen.getByLabelText('Notes')).toBeTruthy());
    fireEvent.click(screen.getByLabelText('Notes'));

    fireEvent.change(screen.getByLabelText('Passphrase'), {
      target: { value: 'correct horse battery staple' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Start full backup' }));

    await waitFor(() => expect(enqueue).toHaveBeenCalledTimes(1));
    const [init] = enqueue.mock.calls[0] as unknown as [RequestInit];
    expect(JSON.parse(init.body as string).excludePluginIds).toEqual(['com.example.notes']);
  });
});
