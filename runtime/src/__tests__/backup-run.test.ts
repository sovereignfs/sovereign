import type { BackupJobRow } from '@sovereignfs/db';
import { afterEach, describe, expect, it, vi } from 'vitest';

const spawnSyncMock = vi.hoisted(() => vi.fn());
const existsSyncMock = vi.hoisted(() => vi.fn());
const statSyncMock = vi.hoisted(() => vi.fn());
const mkdirSyncMock = vi.hoisted(() => vi.fn());
const writeFileSyncMock = vi.hoisted(() => vi.fn());
const takeBackupPassphraseMock = vi.hoisted(() => vi.fn());
const encryptMock = vi.hoisted(() => vi.fn());
const assembleExportMock = vi.hoisted(() => vi.fn());
const gatherPlatformExportMock = vi.hoisted(() => vi.fn());
const eligibleExportPluginsMock = vi.hoisted(() => vi.fn());
const installedPluginsRosterMock = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({ spawnSync: spawnSyncMock }));
vi.mock('node:fs', () => ({
  existsSync: existsSyncMock,
  statSync: statSyncMock,
  mkdirSync: mkdirSyncMock,
  writeFileSync: writeFileSyncMock,
}));
vi.mock('@sovereignfs/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sovereignfs/db')>();
  return { ...actual, findWorkspaceRoot: () => '/workspace' };
});
vi.mock('../backup-passphrase-store', () => ({
  takeBackupPassphrase: takeBackupPassphraseMock,
}));
vi.mock('../backup-encryption', () => ({ encrypt: encryptMock }));
vi.mock('../platform-version', () => ({ getPlatformVersion: () => '0.99.0' }));
vi.mock('../portability/assemble', () => ({ assembleExport: assembleExportMock }));
vi.mock('../portability/platform', () => ({
  gatherPlatformExport: gatherPlatformExportMock,
  eligibleExportPlugins: eligibleExportPluginsMock,
  installedPluginsRoster: installedPluginsRosterMock,
}));

const { runInstanceBackup, runUserBackup } = await import('../backup-run');

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

describe('runUserBackup', () => {
  function userJob(overrides: Partial<BackupJobRow> = {}): BackupJobRow {
    return job({
      scope: 'user',
      requestedByUserId: 'user-1',
      archivePath: '/workspace/backups/sovereign-backup-job-1.zip.age',
      ...overrides,
    });
  }

  it('fails if the job has no requestedByUserId — cannot run', async () => {
    await expect(runUserBackup(userJob({ requestedByUserId: null }))).rejects.toThrow(
      /requestedByUserId/,
    );
    expect(takeBackupPassphraseMock).not.toHaveBeenCalled();
  });

  it('fails cleanly when no passphrase is available (server restarted before claim)', async () => {
    takeBackupPassphraseMock.mockReturnValue(undefined);
    await expect(runUserBackup(userJob())).rejects.toThrow(/No passphrase available/);
    expect(assembleExportMock).not.toHaveBeenCalled();
  });

  it('assembles, encrypts, and writes the archive using the stored passphrase', async () => {
    takeBackupPassphraseMock.mockReturnValue('correct horse battery staple');
    gatherPlatformExportMock.mockResolvedValue({ name: 'Ada' });
    eligibleExportPluginsMock.mockResolvedValue({ 'test.plugin': '1.0.0' });
    installedPluginsRosterMock.mockResolvedValue([]);
    assembleExportMock.mockResolvedValue(new Uint8Array([1, 2, 3]));
    encryptMock.mockResolvedValue(Buffer.from('ciphertext').toString('base64url'));

    const j = userJob({
      optionsJson: JSON.stringify({ includeFiles: false, excludePluginIds: ['x.plugin'] }),
    });
    const result = await runUserBackup(j);

    // The passphrase reaches only the encryption call, never assembleExport.
    expect(gatherPlatformExportMock).toHaveBeenCalledWith('user-1', null);
    expect(assembleExportMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        options: { includeFiles: false, excludePluginIds: ['x.plugin'] },
      }),
    );
    expect(encryptMock).toHaveBeenCalledWith(
      Buffer.from([1, 2, 3]),
      'correct horse battery staple',
    );
    expect(mkdirSyncMock).toHaveBeenCalled();
    expect(writeFileSyncMock).toHaveBeenCalledWith(j.archivePath, expect.any(Buffer));
    expect(result.archivePath).toBe(j.archivePath);
    expect(result.sizeBytes).toBe(Buffer.from('ciphertext').length);
  });

  it('defaults includeFiles to true when optionsJson omits it', async () => {
    takeBackupPassphraseMock.mockReturnValue('a passphrase');
    gatherPlatformExportMock.mockResolvedValue({});
    eligibleExportPluginsMock.mockResolvedValue({});
    installedPluginsRosterMock.mockResolvedValue([]);
    assembleExportMock.mockResolvedValue(new Uint8Array());
    encryptMock.mockResolvedValue('');

    await runUserBackup(userJob({ optionsJson: null }));

    expect(assembleExportMock).toHaveBeenCalledWith(
      expect.objectContaining({ options: { includeFiles: true, excludePluginIds: undefined } }),
    );
  });
});
