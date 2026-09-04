import type { BackupJobRow } from '@sovereignfs/db';
import { afterEach, describe, expect, it, vi } from 'vitest';

const spawnSyncMock = vi.hoisted(() => vi.fn());
const existsSyncMock = vi.hoisted(() => vi.fn());
const statSyncMock = vi.hoisted(() => vi.fn());
const mkdirSyncMock = vi.hoisted(() => vi.fn());
const writeFileSyncMock = vi.hoisted(() => vi.fn());
const takeBackupPassphraseMock = vi.hoisted(() => vi.fn());
const encryptMock = vi.hoisted(() => vi.fn());
const encryptToRecipientsMock = vi.hoisted(() => vi.fn());
const assembleExportMock = vi.hoisted(() => vi.fn());
const gatherPlatformExportMock = vi.hoisted(() => vi.fn());
const eligibleExportPluginsMock = vi.hoisted(() => vi.fn());
const installedPluginsRosterMock = vi.hoisted(() => vi.fn());
const getPlatformDbMock = vi.hoisted(() => vi.fn(async () => ({}) as never));
const getPluginConnectionMock = vi.hoisted(() => vi.fn());
const getPluginSecretMock = vi.hoisted(() => vi.fn());
const markBackupJobPushResultMock = vi.hoisted(() => vi.fn());
const markPluginConnectionErrorMock = vi.hoisted(() => vi.fn());
const markPluginConnectionUsedMock = vi.hoisted(() => vi.fn());
const pushBackupToGitMock = vi.hoisted(() => vi.fn());
const fetchBackupBlobMock = vi.hoisted(() => vi.fn());
const decryptSecretValueMock = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({ spawnSync: spawnSyncMock }));
vi.mock('node:fs', () => ({
  existsSync: existsSyncMock,
  statSync: statSyncMock,
  mkdirSync: mkdirSyncMock,
  writeFileSync: writeFileSyncMock,
}));
vi.mock('@sovereignfs/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sovereignfs/db')>();
  return {
    ...actual,
    findWorkspaceRoot: () => '/workspace',
    getPluginConnection: getPluginConnectionMock,
    getPluginSecret: getPluginSecretMock,
    markBackupJobPushResult: markBackupJobPushResultMock,
    markPluginConnectionError: markPluginConnectionErrorMock,
    markPluginConnectionUsed: markPluginConnectionUsedMock,
  };
});
vi.mock('../backup-passphrase-store', () => ({
  takeBackupPassphrase: takeBackupPassphraseMock,
}));
vi.mock('../backup-encryption', () => ({
  encrypt: encryptMock,
  encryptToRecipients: encryptToRecipientsMock,
}));
vi.mock('../platform-version', () => ({ getPlatformVersion: () => '0.99.0' }));
vi.mock('../portability/assemble', () => ({ assembleExport: assembleExportMock }));
vi.mock('../portability/platform', () => ({
  gatherPlatformExport: gatherPlatformExportMock,
  eligibleExportPlugins: eligibleExportPluginsMock,
  installedPluginsRoster: installedPluginsRosterMock,
}));
vi.mock('../db', () => ({ getPlatformDb: getPlatformDbMock }));
vi.mock('../git-backup', () => ({
  pushBackupToGit: pushBackupToGitMock,
  fetchBackupBlob: fetchBackupBlobMock,
}));
vi.mock('../secrets', () => ({ decryptSecretValue: decryptSecretValueMock }));

const { runInstanceBackup, runRestoreFetch, runUserBackup } = await import('../backup-run');

// Matches join(findWorkspaceRoot(), 'runtime', 'dist-cli', 'sv-backup-cli.js')
// — findWorkspaceRoot is mocked to '/workspace' above.
const BUNDLED_CLI_PATH = '/workspace/runtime/dist-cli/sv-backup-cli.js';

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
    pushStatus: null,
    pushError: null,
    kind: 'backup',
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

  it('falls back to `pnpm sv backup --out <archivePath>` (argv array, no shell string) when the bundled CLI has not been built', async () => {
    spawnSyncMock.mockReturnValue({ status: 0, error: undefined, signal: null, stderr: '' });
    // Bundled CLI absent (native `pnpm dev`/`tools` checkout) — job.archivePath present (real archive produced).
    existsSyncMock.mockImplementation((p: unknown) => p !== BUNDLED_CLI_PATH);
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

  it('spawns the bundled CLI directly with `node` (argv array, no shell string) when present — epic task 8.16', async () => {
    spawnSyncMock.mockReturnValue({ status: 0, error: undefined, signal: null, stderr: '' });
    // Bundled CLI present (production `runner` image) — job.archivePath also present (real archive produced).
    existsSyncMock.mockReturnValue(true);
    statSyncMock.mockReturnValue({ size: 4096 });

    const j = job();
    const result = await runInstanceBackup(j);

    expect(spawnSyncMock).toHaveBeenCalledWith(
      'node',
      [BUNDLED_CLI_PATH, 'backup', '--out', j.archivePath],
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

  describe('optional git push (workstream 0023 leg 3, epic 8.39)', () => {
    const CONNECTION = {
      id: 'dest-1',
      secretRef: 'secret-1',
      metadata: JSON.stringify({
        repoUrl: 'https://git.example.com/me/backups.git',
        branch: 'backups',
        authType: 'https-token',
        ageRecipient: 'age1testrecipient',
      }),
    };
    const SECRET = { ciphertext: 'envelope', scope: 'user' as const };

    function setUpHappyPathThrough(): void {
      takeBackupPassphraseMock.mockReturnValue('correct horse battery staple');
      gatherPlatformExportMock.mockResolvedValue({});
      eligibleExportPluginsMock.mockResolvedValue({});
      installedPluginsRosterMock.mockResolvedValue([]);
      assembleExportMock.mockResolvedValue(new Uint8Array([9, 9, 9]));
      encryptMock.mockResolvedValue(Buffer.from('ciphertext').toString('base64url'));
    }

    it('does not push at all when optionsJson has no pushDestinationId', async () => {
      setUpHappyPathThrough();
      await runUserBackup(userJob({ optionsJson: JSON.stringify({}) }));
      expect(getPluginConnectionMock).not.toHaveBeenCalled();
      expect(pushBackupToGitMock).not.toHaveBeenCalled();
      expect(markBackupJobPushResultMock).not.toHaveBeenCalled();
    });

    it('encrypts to the destination age recipient (never the passphrase) and pushes a tagged commit', async () => {
      setUpHappyPathThrough();
      getPluginConnectionMock.mockResolvedValue(CONNECTION);
      getPluginSecretMock.mockResolvedValue(SECRET);
      decryptSecretValueMock.mockReturnValue('the-real-token');
      encryptToRecipientsMock.mockResolvedValue(
        Buffer.from('recipient-ciphertext').toString('base64url'),
      );
      pushBackupToGitMock.mockResolvedValue({ tag: 'sv-backup/x/v0.99.0', commitSha: 'abc123' });

      const j = userJob({ optionsJson: JSON.stringify({ pushDestinationId: 'dest-1' }) });
      const result = await runUserBackup(j);

      // The archive itself still succeeds and is unaffected by the push step.
      expect(result.archivePath).toBe(j.archivePath);

      expect(getPluginConnectionMock).toHaveBeenCalledWith(
        {},
        'dest-1',
        expect.objectContaining({ pluginId: 'fs.sovereign.account', userId: 'user-1' }),
      );
      expect(decryptSecretValueMock).toHaveBeenCalledWith(
        'envelope',
        expect.objectContaining({ scope: 'user', userId: 'user-1' }),
      );
      // Recipient-mode encryption, not the passphrase-mode encrypt() used for direct download.
      expect(encryptToRecipientsMock).toHaveBeenCalledWith(Buffer.from([9, 9, 9]), [
        'age1testrecipient',
      ]);
      expect(pushBackupToGitMock).toHaveBeenCalledWith(
        expect.objectContaining({
          repoUrl: 'https://git.example.com/me/backups.git',
          branch: 'backups',
          authType: 'https-token',
          credential: 'the-real-token',
        }),
        Buffer.from('recipient-ciphertext'),
        'backup.age',
        expect.objectContaining({ platformVersion: '0.99.0', scope: 'user' }),
        '0.99.0',
      );
      expect(markPluginConnectionUsedMock).toHaveBeenCalledWith({}, 'dest-1', expect.anything());
      expect(markBackupJobPushResultMock).toHaveBeenCalledWith({}, j.id, { status: 'succeeded' });
      expect(markPluginConnectionErrorMock).not.toHaveBeenCalled();
    });

    it('a failed push never fails the job — the archive result still resolves, and failure is recorded on the connection and the job pushStatus, not the job status/errorMessage', async () => {
      setUpHappyPathThrough();
      getPluginConnectionMock.mockResolvedValue(CONNECTION);
      getPluginSecretMock.mockResolvedValue(SECRET);
      decryptSecretValueMock.mockReturnValue('the-real-token');
      encryptToRecipientsMock.mockResolvedValue(Buffer.from('x').toString('base64url'));
      pushBackupToGitMock.mockRejectedValue(new Error('git push failed: unreachable remote'));

      const j = userJob({ optionsJson: JSON.stringify({ pushDestinationId: 'dest-1' }) });
      await expect(runUserBackup(j)).resolves.toEqual({
        archivePath: j.archivePath,
        sizeBytes: expect.any(Number) as unknown as number,
      });

      expect(markBackupJobPushResultMock).toHaveBeenCalledWith({}, j.id, {
        status: 'failed',
        error: expect.stringContaining('unreachable remote') as unknown as string,
      });
      expect(markPluginConnectionErrorMock).toHaveBeenCalledWith(
        {},
        'dest-1',
        expect.anything(),
        expect.stringContaining('unreachable remote'),
        'error',
      );
    });

    it('classifies an authentication-flavored push failure as needs_reauth rather than the generic error status', async () => {
      setUpHappyPathThrough();
      getPluginConnectionMock.mockResolvedValue(CONNECTION);
      getPluginSecretMock.mockResolvedValue(SECRET);
      decryptSecretValueMock.mockReturnValue('the-real-token');
      encryptToRecipientsMock.mockResolvedValue(Buffer.from('x').toString('base64url'));
      pushBackupToGitMock.mockRejectedValue(new Error('git push failed: Authentication failed'));

      await runUserBackup(
        userJob({ optionsJson: JSON.stringify({ pushDestinationId: 'dest-1' }) }),
      );

      expect(markPluginConnectionErrorMock).toHaveBeenCalledWith(
        {},
        'dest-1',
        expect.anything(),
        expect.any(String),
        'needs_reauth',
      );
    });

    it('treats a missing/disconnected destination as a push failure rather than throwing out of the job', async () => {
      setUpHappyPathThrough();
      getPluginConnectionMock.mockResolvedValue(undefined);

      const j = userJob({ optionsJson: JSON.stringify({ pushDestinationId: 'dest-missing' }) });
      await expect(runUserBackup(j)).resolves.toEqual({
        archivePath: j.archivePath,
        sizeBytes: expect.any(Number) as unknown as number,
      });
      expect(pushBackupToGitMock).not.toHaveBeenCalled();
      expect(markBackupJobPushResultMock).toHaveBeenCalledWith({}, j.id, {
        status: 'failed',
        error: expect.stringContaining('not found') as unknown as string,
      });
    });
  });
});

describe('runRestoreFetch', () => {
  const CONNECTION = {
    id: 'dest-1',
    secretRef: 'secret-1',
    metadata: JSON.stringify({
      repoUrl: 'https://git.example.com/me/backups.git',
      branch: 'backups',
      authType: 'https-token',
      ageRecipient: 'age1testrecipient',
    }),
  };
  const SECRET = { ciphertext: 'envelope', scope: 'user' as const };

  function restoreJob(overrides: Partial<BackupJobRow> = {}): BackupJobRow {
    return job({
      scope: 'user',
      kind: 'restore-fetch',
      requestedByUserId: 'user-1',
      archivePath: '/workspace/backups/sovereign-restore-job-1.age',
      optionsJson: JSON.stringify({ destinationId: 'dest-1', tag: 'sv-backup/x/v0.99.0' }),
      ...overrides,
    });
  }

  it('fails if the job has no requestedByUserId — cannot run', async () => {
    await expect(runRestoreFetch(restoreJob({ requestedByUserId: null }))).rejects.toThrow(
      /requestedByUserId/,
    );
  });

  it('fails cleanly when optionsJson is missing the destination or tag', async () => {
    await expect(
      runRestoreFetch(restoreJob({ optionsJson: JSON.stringify({ tag: 'x' }) })),
    ).rejects.toThrow(/missing its destination or tag/);
    await expect(
      runRestoreFetch(restoreJob({ optionsJson: JSON.stringify({ destinationId: 'dest-1' }) })),
    ).rejects.toThrow(/missing its destination or tag/);
  });

  it('throws if the destination no longer exists — this job is expected to fail, not silently no-op', async () => {
    getPluginConnectionMock.mockResolvedValue(undefined);
    await expect(runRestoreFetch(restoreJob())).rejects.toThrow(/not found or no longer connected/);
  });

  it('fetches the ciphertext blob from the destination and writes it verbatim to archivePath', async () => {
    getPluginConnectionMock.mockResolvedValue(CONNECTION);
    getPluginSecretMock.mockResolvedValue(SECRET);
    decryptSecretValueMock.mockReturnValue('the-real-token');
    const blob = Buffer.from('recipient-mode-ciphertext-bytes');
    fetchBackupBlobMock.mockResolvedValue(blob);

    const j = restoreJob();
    const result = await runRestoreFetch(j);

    expect(result).toEqual({ archivePath: j.archivePath, sizeBytes: blob.length });
    expect(getPluginConnectionMock).toHaveBeenCalledWith(
      {},
      'dest-1',
      expect.objectContaining({ pluginId: 'fs.sovereign.account', userId: 'user-1' }),
    );
    expect(decryptSecretValueMock).toHaveBeenCalledWith(
      'envelope',
      expect.objectContaining({ scope: 'user', userId: 'user-1' }),
    );
    expect(fetchBackupBlobMock).toHaveBeenCalledWith(
      expect.objectContaining({
        repoUrl: 'https://git.example.com/me/backups.git',
        authType: 'https-token',
        credential: 'the-real-token',
      }),
      'sv-backup/x/v0.99.0',
    );
    expect(writeFileSyncMock).toHaveBeenCalledWith(j.archivePath, blob);
    expect(markPluginConnectionUsedMock).toHaveBeenCalledWith({}, 'dest-1', expect.anything());
  });

  it('propagates a fetch failure — the worker records it as a genuine job failure, unlike a push', async () => {
    getPluginConnectionMock.mockResolvedValue(CONNECTION);
    getPluginSecretMock.mockResolvedValue(SECRET);
    decryptSecretValueMock.mockReturnValue('the-real-token');
    fetchBackupBlobMock.mockRejectedValue(new Error('git fetch failed: unreachable remote'));

    await expect(runRestoreFetch(restoreJob())).rejects.toThrow(/unreachable remote/);
    expect(writeFileSyncMock).not.toHaveBeenCalled();
  });
});
