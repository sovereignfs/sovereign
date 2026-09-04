// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { GitRestorePanel } from '../GitRestorePanel';

// vi.mock's factory is hoisted above top-level code, so everything it
// references — including the fake class itself, since `class` declarations
// sit in the TDZ unlike `function` — must go through vi.hoisted(). A plain
// arrow function won't do for `Decrypter`: the component calls it via `new`,
// and arrow functions are never constructible.
const { addIdentityMock, FakeDecrypter } = vi.hoisted(() => {
  const decryptMock = vi.fn(async () => new Blob(['decrypted-zip-bytes']));
  const addIdentityMock = vi.fn();
  function FakeDecrypter(this: { addIdentity: unknown; decrypt: unknown }) {
    this.addIdentity = addIdentityMock;
    this.decrypt = decryptMock;
  }
  return { decryptMock, addIdentityMock, FakeDecrypter };
});
vi.mock('age-encryption', () => ({ Decrypter: FakeDecrypter }));

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 400): Response {
  return { ok, status, json: async () => body } as unknown as Response;
}

function mockFetchRouter(handlers: [string, (init?: RequestInit) => Response][]) {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    for (const [prefix, handler] of handlers) {
      if (url.includes(prefix)) return Promise.resolve(handler(init));
    }
    throw new Error(`Unhandled fetch: ${url}`);
  });
}

const CONNECTIONS = {
  connections: [
    { id: 'dest-1', provider: 'git.custom', label: 'My backup repo', status: 'connected' },
    {
      id: 'dest-2',
      provider: 'warden.model',
      label: 'Not a backup destination',
      status: 'connected',
    },
  ],
};
const TAGS = {
  tags: [
    { tag: 'sv-backup/x/v1', timestamp: '2026-07-06T12:30:00.000Z', platformVersion: '0.121.1' },
  ],
};

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function selectDestinationAndTag() {
  await waitFor(() => expect(screen.getByLabelText('Destination')).toBeTruthy());
  fireEvent.change(screen.getByLabelText('Destination'), { target: { value: 'dest-1' } });
  await waitFor(() => expect(screen.getByLabelText('Backup')).toBeTruthy());
  fireEvent.change(screen.getByLabelText('Backup'), { target: { value: 'sv-backup/x/v1' } });
}

describe('GitRestorePanel', () => {
  it('renders nothing when the user has no connected git destinations', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchRouter([['/api/account/connections', () => jsonResponse({ connections: [] })]]),
    );
    const { container } = render(<GitRestorePanel />);
    await waitFor(() => expect(container.firstChild).toBeNull());
  });

  it('filters connections to git.custom, connected destinations only', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchRouter([['/api/account/connections', () => jsonResponse(CONNECTIONS)]]),
    );
    render(<GitRestorePanel />);
    await waitFor(() => expect(screen.getByLabelText('Destination')).toBeTruthy());
    expect(screen.getByText('My backup repo')).toBeTruthy();
    expect(screen.queryByText('Not a backup destination')).toBeNull();
  });

  it('lists backups once a destination is selected', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchRouter([
        ['/api/account/connections', () => jsonResponse(CONNECTIONS)],
        ['/api/account/restore-jobs/tags', () => jsonResponse(TAGS)],
      ]),
    );
    render(<GitRestorePanel />);
    await selectDestinationAndTag();
    expect(screen.getByLabelText('Backup')).toBeTruthy();
  });

  it('shows a message when a destination has no backups yet', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchRouter([
        ['/api/account/connections', () => jsonResponse(CONNECTIONS)],
        ['/api/account/restore-jobs/tags', () => jsonResponse({ tags: [] })],
      ]),
    );
    render(<GitRestorePanel />);
    await waitFor(() => expect(screen.getByLabelText('Destination')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('Destination'), { target: { value: 'dest-1' } });
    await waitFor(() => expect(screen.getByText(/No backups found/)).toBeTruthy());
  });

  it('surfaces a listing error rather than throwing', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchRouter([
        ['/api/account/connections', () => jsonResponse(CONNECTIONS)],
        [
          '/api/account/restore-jobs/tags',
          () => jsonResponse({ error: 'unreachable remote' }, false, 502),
        ],
      ]),
    );
    render(<GitRestorePanel />);
    await waitFor(() => expect(screen.getByLabelText('Destination')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('Destination'), { target: { value: 'dest-1' } });
    await waitFor(() => expect(screen.getByText('unreachable remote')).toBeTruthy());
  });

  it('runs the full restore flow end to end: enqueue, poll, download, decrypt, and import', async () => {
    const enqueue = vi.fn(() => jsonResponse({ jobId: 'job-1' }, true, 202));
    let pollCount = 0;
    const poll = vi.fn(() => {
      pollCount += 1;
      if (pollCount < 2) {
        return jsonResponse({ jobId: 'job-1', status: 'running', downloadUrl: null });
      }
      return jsonResponse({
        jobId: 'job-1',
        status: 'complete',
        downloadUrl: '/api/backup-jobs/job-1/download/tok',
      });
    });
    const download = vi.fn(
      () => ({ ok: true, body: new Blob(['ciphertext']) }) as unknown as Response,
    );
    const importRoute = vi.fn(() =>
      jsonResponse({
        formatVersion: 1,
        sourceInstance: null,
        sections: [{ pluginId: 'com.example.notes', status: 'imported' }],
      }),
    );

    vi.stubGlobal(
      'fetch',
      mockFetchRouter([
        ['/api/account/connections', () => jsonResponse(CONNECTIONS)],
        ['/api/account/restore-jobs/tags', () => jsonResponse(TAGS)],
        ['/api/account/restore-jobs/job-1', poll],
        ['/api/account/restore-jobs', enqueue],
        ['/api/backup-jobs/job-1/download/tok', download],
        ['/api/account/import', importRoute],
      ]),
    );

    render(<GitRestorePanel />);
    await selectDestinationAndTag();

    const file = new File(['AGE-SECRET-KEY-1QQQ...'], 'sovereign-backup-key.txt', {
      type: 'text/plain',
    });
    fireEvent.change(screen.getByLabelText('Upload your backup key'), {
      target: { files: [file] },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Restore this backup' }));
    await vi.advanceTimersByTimeAsync(3000);

    await waitFor(() => expect(screen.getByText('Restore complete')).toBeTruthy());
    expect(screen.getByText('imported')).toBeTruthy();

    expect(enqueue).toHaveBeenCalled();
    const enqueueBody = JSON.parse(
      (enqueue.mock.calls[0]?.[0] as RequestInit).body as string,
    ) as unknown;
    expect(enqueueBody).toEqual({ destinationId: 'dest-1', tag: 'sv-backup/x/v1' });
    expect(addIdentityMock).toHaveBeenCalledWith('AGE-SECRET-KEY-1QQQ...');
    expect(importRoute).toHaveBeenCalled();

    // Re-prompts for the identity on the next attempt rather than remembering it.
    expect(screen.getByText('Choose your backup key')).toBeTruthy();
  });

  it('surfaces a restore-job failure instead of a generic error', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchRouter([
        ['/api/account/connections', () => jsonResponse(CONNECTIONS)],
        ['/api/account/restore-jobs/tags', () => jsonResponse(TAGS)],
        [
          '/api/account/restore-jobs/job-1',
          () =>
            jsonResponse({
              jobId: 'job-1',
              status: 'failed',
              errorMessage: 'Backup destination credential could not be read.',
              downloadUrl: null,
            }),
        ],
        ['/api/account/restore-jobs', () => jsonResponse({ jobId: 'job-1' }, true, 202)],
      ]),
    );

    render(<GitRestorePanel />);
    await selectDestinationAndTag();
    const file = new File(['identity'], 'key.txt', { type: 'text/plain' });
    fireEvent.change(screen.getByLabelText('Upload your backup key'), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Restore this backup' }));

    await waitFor(() =>
      expect(screen.getByText('Backup destination credential could not be read.')).toBeTruthy(),
    );
  });
});
