import type { BackupJobRow } from '@sovereignfs/db';
import { afterEach, describe, expect, it, vi } from 'vitest';

const spawnSyncMock = vi.hoisted(() => vi.fn());
const existsSyncMock = vi.hoisted(() => vi.fn());
const statSyncMock = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({ spawnSync: spawnSyncMock }));
vi.mock('node:fs', () => ({ existsSync: existsSyncMock, statSync: statSyncMock }));
vi.mock('@sovereignfs/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sovereignfs/db')>();
  return { ...actual, findWorkspaceRoot: () => '/workspace' };
});

const { runInstanceBackup } = await import('../backup-run');

function job(overrides: Partial<BackupJobRow> = {}): BackupJobRow {
  return {
    id: 'job-1',
    tenantId: 'default',
    scope: 'instance',
    requestedByUserId: null,
    status: 'running',
    optionsJson: null,
    archivePath: '/workspace/backups/sovereign-backup-job-1.tar.gz',
    sizeBytes: 0,
    errorMessage: null,
    createdAt: 1_000_000_000,
    startedAt: 1_000_000_000,
    completedAt: null,
    expiresAt: 1_000_200_000,
    ...overrides,
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('runInstanceBackup', () => {
  it('rejects a user-scope job — not implemented yet (epic task 8.18)', async () => {
    await expect(runInstanceBackup(job({ scope: 'user' }))).rejects.toThrow(/8\.18/);
    expect(spawnSyncMock).not.toHaveBeenCalled();
  });

  it('rejects optionsJson.excludePlugins — sv backup has no --exclude-plugin flag yet', async () => {
    const j = job({ optionsJson: JSON.stringify({ excludePlugins: ['com.example.notes'] }) });
    await expect(runInstanceBackup(j)).rejects.toThrow(/exclude-plugin/);
    expect(spawnSyncMock).not.toHaveBeenCalled();
  });

  it('tolerates malformed optionsJson (falls back to no options)', async () => {
    spawnSyncMock.mockReturnValue({ status: 0, error: undefined, signal: null, stderr: '' });
    existsSyncMock.mockReturnValue(true);
    statSyncMock.mockReturnValue({ size: 123 });

    const j = job({ optionsJson: '{not valid json' });
    await expect(runInstanceBackup(j)).resolves.toMatchObject({ sizeBytes: 123 });
  });

  it('spawns `pnpm sv backup --out <archivePath>` with an argv array, no shell string', async () => {
    spawnSyncMock.mockReturnValue({ status: 0, error: undefined, signal: null, stderr: '' });
    existsSyncMock.mockReturnValue(true);
    statSyncMock.mockReturnValue({ size: 4096 });

    const j = job();
    const result = await runInstanceBackup(j);

    expect(spawnSyncMock).toHaveBeenCalledWith(
      'pnpm',
      ['sv', 'backup', '--out', j.archivePath],
      expect.objectContaining({ cwd: '/workspace' }),
    );
    expect(result).toEqual({ archivePath: j.archivePath, sizeBytes: 4096 });
  });

  it('fails with a clear message when the subprocess cannot be spawned at all', async () => {
    spawnSyncMock.mockReturnValue({
      status: null,
      error: new Error('spawn pnpm ENOENT'),
      signal: null,
      stderr: '',
    });

    await expect(runInstanceBackup(job())).rejects.toThrow(/ENOENT/);
  });

  it('fails with a clear message when the subprocess is killed (timeout)', async () => {
    spawnSyncMock.mockReturnValue({
      status: null,
      error: undefined,
      signal: 'SIGTERM',
      stderr: '',
    });

    await expect(runInstanceBackup(job())).rejects.toThrow(/SIGTERM/);
  });

  it('fails with captured stderr when sv backup exits non-zero', async () => {
    spawnSyncMock.mockReturnValue({
      status: 1,
      error: undefined,
      signal: null,
      stderr: 'DB_DIALECT=postgres requires POSTGRES_DB_URL to be set.',
    });

    await expect(runInstanceBackup(job())).rejects.toThrow(/POSTGRES_DB_URL/);
  });

  it('fails if sv backup exits 0 but no archive was actually written', async () => {
    spawnSyncMock.mockReturnValue({ status: 0, error: undefined, signal: null, stderr: '' });
    existsSyncMock.mockReturnValue(false);

    await expect(runInstanceBackup(job())).rejects.toThrow(/no archive was found/);
  });
});
