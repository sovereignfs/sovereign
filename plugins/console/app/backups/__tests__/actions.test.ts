import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireSession = vi.fn();
const hasCapability = vi.fn();

vi.mock('@sovereignfs/sdk', () => ({
  sdk: {
    auth: {
      requireSession: () => requireSession(),
      hasCapability: (...args: unknown[]) => hasCapability(...args),
    },
  },
}));

const { triggerInstanceBackupAction, getInstanceBackupJobStatusAction } =
  await import('../actions');

function formData(entries: Record<string, string | string[]>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    if (Array.isArray(value)) {
      for (const v of value) fd.append(key, v);
    } else {
      fd.set(key, value);
    }
  }
  return fd;
}

function mockAdminFetch(responses: Record<string, { status: number; body?: unknown }>) {
  return vi.fn((url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const path = new URL(url).pathname + new URL(url).search;
    const key = `${method} ${path}`;
    const match = responses[key] ?? responses[path];
    if (!match) return Promise.reject(new Error(`unexpected fetch: ${key}`));
    return Promise.resolve(
      new Response(match.body ? JSON.stringify(match.body) : '{}', { status: match.status }),
    );
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  requireSession.mockResolvedValue({ user: { id: 'admin-1' } });
  hasCapability.mockReturnValue(true);
});

describe('triggerInstanceBackupAction', () => {
  it('refuses a session without instance:backup, without calling fetch', async () => {
    hasCapability.mockReturnValue(false);
    vi.stubGlobal('fetch', vi.fn());

    const result = await triggerInstanceBackupAction(
      null,
      formData({ passphrase: 'x'.repeat(12) }),
    );

    expect(result).toEqual({
      ok: false,
      error: 'Insufficient privileges to back up this instance.',
    });
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('rejects an empty passphrase before ever calling fetch', async () => {
    vi.stubGlobal('fetch', vi.fn());

    const result = await triggerInstanceBackupAction(null, formData({ passphrase: '   ' }));

    expect(result).toEqual({ ok: false, error: 'A passphrase is required.' });
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('posts passphrase, excludePlugins, and pushToGit, returning the enqueued jobId', async () => {
    const fetchMock = mockAdminFetch({
      'POST /api/admin/backup-jobs': { status: 202, body: { jobId: 'job-123' } },
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await triggerInstanceBackupAction(
      null,
      formData({
        passphrase: 'correct horse battery staple',
        excludePlugins: ['fs.sovereign.warden', 'fs.sovereign.tasks'],
        pushToGit: 'on',
      }),
    );

    expect(result).toEqual({ ok: true, jobId: 'job-123' });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/admin/backup-jobs'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          passphrase: 'correct horse battery staple',
          excludePlugins: ['fs.sovereign.warden', 'fs.sovereign.tasks'],
          pushToGit: true,
        }),
      }),
    );
    vi.unstubAllGlobals();
  });

  it('defaults pushToGit to false and excludePlugins to an empty array when neither is present', async () => {
    const fetchMock = mockAdminFetch({
      'POST /api/admin/backup-jobs': { status: 202, body: { jobId: 'job-456' } },
    });
    vi.stubGlobal('fetch', fetchMock);

    await triggerInstanceBackupAction(null, formData({ passphrase: 'a real passphrase' }));

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({
          passphrase: 'a real passphrase',
          excludePlugins: [],
          pushToGit: false,
        }),
      }),
    );
    vi.unstubAllGlobals();
  });

  it('surfaces a non-OK response as a failure', async () => {
    vi.stubGlobal(
      'fetch',
      mockAdminFetch({
        'POST /api/admin/backup-jobs': {
          status: 400,
          body: { error: 'A passphrase is required.' },
        },
      }),
    );

    const result = await triggerInstanceBackupAction(
      null,
      formData({ passphrase: 'a real passphrase' }),
    );

    expect(result).toEqual({ ok: false, error: 'A passphrase is required.' });
    vi.unstubAllGlobals();
  });

  it('reports a network failure without throwing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('ECONNREFUSED'))),
    );

    const result = await triggerInstanceBackupAction(
      null,
      formData({ passphrase: 'a real passphrase' }),
    );

    expect(result).toEqual({ ok: false, error: 'Failed to reach the runtime API.' });
    vi.unstubAllGlobals();
  });
});

describe('getInstanceBackupJobStatusAction', () => {
  it('refuses a session without instance:backup, without calling fetch', async () => {
    hasCapability.mockReturnValue(false);
    vi.stubGlobal('fetch', vi.fn());

    await expect(getInstanceBackupJobStatusAction('job-1')).rejects.toThrow(
      'Insufficient privileges to back up this instance.',
    );
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('returns the parsed status for an authorized session', async () => {
    const status = {
      jobId: 'job-1',
      status: 'complete',
      sizeBytes: 4096,
      errorMessage: null,
      downloadUrl: '/api/backup-jobs/job-1/download/tok',
      pushStatus: null,
      pushError: null,
    };
    vi.stubGlobal(
      'fetch',
      mockAdminFetch({ 'GET /api/admin/backup-jobs/job-1': { status: 200, body: status } }),
    );

    const result = await getInstanceBackupJobStatusAction('job-1');

    expect(result).toEqual(status);
    vi.unstubAllGlobals();
  });

  it("throws on a non-OK response, matching the client poll loop's own try/catch-and-retry expectation", async () => {
    vi.stubGlobal('fetch', mockAdminFetch({ 'GET /api/admin/backup-jobs/job-1': { status: 404 } }));

    await expect(getInstanceBackupJobStatusAction('job-1')).rejects.toThrow(
      'Failed to fetch backup job status: 404',
    );
    vi.unstubAllGlobals();
  });
});
