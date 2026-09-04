import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@sovereignfs/db', () => ({
  DEFAULT_TENANT_ID: 'default',
  getPluginConnection: vi.fn(),
  getPluginSecret: vi.fn(),
}));
vi.mock('@/src/db', () => ({ getPlatformDb: vi.fn(async () => ({})) }));
vi.mock('@/src/git-backup', () => ({ listBackupTags: vi.fn() }));
vi.mock('@/src/secrets', () => ({ decryptSecretValue: vi.fn(() => 'the-real-token') }));

import { getPluginConnection, getPluginSecret } from '@sovereignfs/db';
import { listBackupTags } from '@/src/git-backup';
import { GET } from '../../app/api/account/restore-jobs/tags/route';

function request(
  destinationId: string | null,
  headers: Record<string, string> = { 'x-sovereign-user-id': 'user-1' },
): Request {
  const url = destinationId
    ? `http://localhost/api/account/restore-jobs/tags?destinationId=${destinationId}`
    : 'http://localhost/api/account/restore-jobs/tags';
  return new Request(url, { headers });
}

const CONNECTION = {
  id: 'dest-1',
  secretRef: 'secret-1',
  metadata: JSON.stringify({
    repoUrl: 'https://git.example.com/me/backups.git',
    authType: 'https-token',
  }),
};
const SECRET = { ciphertext: 'envelope', scope: 'user' as const };

afterEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/account/restore-jobs/tags', () => {
  it('rejects an unauthenticated request', async () => {
    const res = await GET(request('dest-1', {}));
    expect(res.status).toBe(401);
    expect(getPluginConnection).not.toHaveBeenCalled();
  });

  it('rejects a missing destinationId', async () => {
    const res = await GET(request(null));
    expect(res.status).toBe(400);
    expect(getPluginConnection).not.toHaveBeenCalled();
  });

  it('404s for an unknown/foreign destination', async () => {
    vi.mocked(getPluginConnection).mockResolvedValue(undefined);
    const res = await GET(request('dest-1'));
    expect(res.status).toBe(404);
    expect(getPluginConnection).toHaveBeenCalledWith(
      {},
      'dest-1',
      expect.objectContaining({ pluginId: 'fs.sovereign.account', userId: 'user-1' }),
    );
  });

  it('404s for a destination with no stored credential', async () => {
    vi.mocked(getPluginConnection).mockResolvedValue({ id: 'dest-1', secretRef: null } as never);
    const res = await GET(request('dest-1'));
    expect(res.status).toBe(404);
  });

  it('lists the tags for a valid, connected destination', async () => {
    vi.mocked(getPluginConnection).mockResolvedValue(CONNECTION as never);
    vi.mocked(getPluginSecret).mockResolvedValue(SECRET as never);
    const timestamp = new Date('2026-07-06T12:30:00.000Z');
    vi.mocked(listBackupTags).mockResolvedValue([
      { tag: 'sv-backup/x/v1', timestamp, platformVersion: '0.121.1' },
    ]);

    const res = await GET(request('dest-1'));
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      tags: { tag: string; timestamp: string; platformVersion: string }[];
    };
    expect(data.tags).toEqual([
      { tag: 'sv-backup/x/v1', timestamp: timestamp.toISOString(), platformVersion: '0.121.1' },
    ]);
    expect(listBackupTags).toHaveBeenCalledWith({
      repoUrl: 'https://git.example.com/me/backups.git',
      authType: 'https-token',
      credential: 'the-real-token',
    });
  });

  it('returns 502 when listing the remote fails rather than throwing', async () => {
    vi.mocked(getPluginConnection).mockResolvedValue(CONNECTION as never);
    vi.mocked(getPluginSecret).mockResolvedValue(SECRET as never);
    vi.mocked(listBackupTags).mockRejectedValue(new Error('git ls-remote failed: unreachable'));

    const res = await GET(request('dest-1'));
    expect(res.status).toBe(502);
    const data = (await res.json()) as { error: string };
    expect(data.error).toMatch(/unreachable/);
  });
});
