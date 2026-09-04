import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const spawnSyncMock = vi.hoisted(() => vi.fn());
vi.mock('node:child_process', () => ({ spawnSync: spawnSyncMock }));

// consola's own output is noise in a test run; the exit spy is what actually
// matters (real process.exit would kill the test runner).
vi.mock('consola', () => ({
  consola: { start: vi.fn(), success: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { backup, restore } = await import('../backup-restore');

const ORIGINAL_ENV = { ...process.env };

let root: string;
let dataDir: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'sv-backup-restore-test-'));
  dataDir = join(root, 'data');
  writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages:\n');
  writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '1.2.3' }));
  process.env = { ...ORIGINAL_ENV };
  spawnSyncMock.mockReset();
  vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new Error(`process.exit(${String(code)})`);
  }) as never);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

describe('backup', () => {
  it('refuses the SQLite dialect without spawning anything', async () => {
    mkdirSync(dataDir, { recursive: true });
    process.env.DB_DIALECT = 'sqlite';
    await expect(backup.run({ args: { dataDir, out: undefined, _: [] } } as never)).rejects.toThrow(
      'process.exit(1)',
    );
    expect(spawnSyncMock).not.toHaveBeenCalled();
  });

  it('fails cleanly when the data directory does not exist', async () => {
    process.env.DB_DIALECT = 'postgres';
    process.env.POSTGRES_DB_URL = 'postgres://x';
    await expect(
      backup.run({ args: { dataDir: join(root, 'nope'), out: undefined, _: [] } } as never),
    ).rejects.toThrow('process.exit(1)');
    expect(spawnSyncMock).not.toHaveBeenCalled();
  });

  it('fails cleanly when POSTGRES_DB_URL is unset', async () => {
    mkdirSync(dataDir, { recursive: true });
    process.env.DB_DIALECT = 'postgres';
    delete process.env.POSTGRES_DB_URL;
    await expect(backup.run({ args: { dataDir, out: undefined, _: [] } } as never)).rejects.toThrow(
      'process.exit(1)',
    );
    expect(spawnSyncMock).not.toHaveBeenCalled();
  });

  it('Postgres happy path: spawns pg_dump then tar with the expected argv', async () => {
    mkdirSync(dataDir, { recursive: true });
    process.env.DB_DIALECT = 'postgres';
    process.env.POSTGRES_DB_URL = 'postgres://x';
    const out = join(root, 'backups', 'out.tar.gz');
    spawnSyncMock.mockReturnValue({ status: 0 });

    await backup.run({ args: { dataDir, out, _: [] } } as never);

    expect(spawnSyncMock).toHaveBeenCalledTimes(2);
    const [pgDumpCall, tarCall] = spawnSyncMock.mock.calls;
    expect(pgDumpCall[0]).toBe('pg_dump');
    expect(pgDumpCall[1]).toEqual(expect.arrayContaining(['--format=custom', 'postgres://x']));
    expect(tarCall[0]).toBe('tar');
    expect(tarCall[1]).toEqual(expect.arrayContaining(['-czf', out]));
  });

  it('cleans up its temp dir even when pg_dump fails', async () => {
    mkdirSync(dataDir, { recursive: true });
    process.env.DB_DIALECT = 'postgres';
    process.env.POSTGRES_DB_URL = 'postgres://x';
    const backupsDir = join(root, 'backups');
    spawnSyncMock.mockReturnValue({ status: 1 });

    await expect(
      backup.run({
        args: { dataDir, out: join(backupsDir, 'out.tar.gz'), _: [] },
      } as never),
    ).rejects.toThrow('process.exit(1)');

    // Only pg_dump ran (tar never reached); no leftover .sv-backup-* temp dir.
    expect(spawnSyncMock).toHaveBeenCalledTimes(1);
    const leftovers = existsSync(backupsDir)
      ? readdirSync(backupsDir).filter((f: string) => f.startsWith('.sv-backup-'))
      : [];
    expect(leftovers).toEqual([]);
  });
});

describe('restore', () => {
  function makeArchive(): string {
    const archivePath = join(root, 'backup.tar.gz');
    writeFileSync(archivePath, 'fake archive bytes');
    return archivePath;
  }

  it('refuses the SQLite dialect without spawning anything', async () => {
    process.env.DB_DIALECT = 'sqlite';
    const archivePath = makeArchive();
    await expect(
      restore.run({ args: { archive: archivePath, dataDir, _: [] } } as never),
    ).rejects.toThrow('process.exit(1)');
    expect(spawnSyncMock).not.toHaveBeenCalled();
  });

  it('fails cleanly when the archive does not exist', async () => {
    process.env.DB_DIALECT = 'postgres';
    process.env.POSTGRES_DB_URL = 'postgres://x';
    await expect(
      restore.run({
        args: { archive: join(root, 'missing.tar.gz'), dataDir, _: [] },
      } as never),
    ).rejects.toThrow('process.exit(1)');
    expect(spawnSyncMock).not.toHaveBeenCalled();
  });

  it('Postgres happy path: extracts, pg_restores, and restores avatars', async () => {
    process.env.DB_DIALECT = 'postgres';
    process.env.POSTGRES_DB_URL = 'postgres://x';
    const archivePath = makeArchive();

    // tar extraction is faked (spawnSyncMock), so simulate what it would have
    // produced: the dump file `restore` looks for by hard-coded name, and an
    // avatars/ dir it also detects and moves.
    spawnSyncMock.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'tar' && args[0] === '-xzf') {
        const tmp = args[3] as string; // ['-xzf', archivePath, '-C', tmp]
        mkdirSync(tmp, { recursive: true });
        writeFileSync(join(tmp, 'sovereign.pgdump'), 'dump');
        mkdirSync(join(tmp, 'avatars'), { recursive: true });
        writeFileSync(join(tmp, 'avatars', 'a.png'), 'x');
      }
      return { status: 0 };
    });

    await restore.run({ args: { archive: archivePath, dataDir, _: [] } } as never);

    expect(spawnSyncMock).toHaveBeenCalledTimes(3);
    const [tarCall, pgRestoreCall, mvCall] = spawnSyncMock.mock.calls;
    expect(tarCall[0]).toBe('tar');
    expect(pgRestoreCall[0]).toBe('pg_restore');
    expect(pgRestoreCall[1]).toEqual(expect.arrayContaining(['--dbname=postgres://x']));
    expect(mvCall[0]).toBe('mv');
    expect(existsSync(join(dataDir, 'avatars'))).toBe(false); // mv itself is mocked, not really run
  });
});
