/**
 * `sv backup`/`sv restore` — extracted from `bin/sv.ts` (epic task 8.16) so
 * they can be registered from two entrypoints: the full `sv` CLI (unchanged
 * behavior, `pnpm sv backup`/`./bin/sv backup`) and `bin/sv-backup-cli.ts`, a
 * minimal entrypoint `tsup`-bundled into `runtime/dist-cli/` and shipped
 * inside the production `runner` Docker image — which has no `pnpm`/`tsx`/
 * full `node_modules` to run the rest of `sv`'s ~30 subcommands, and no
 * reason to (`runtime/src/backup-run.ts`'s `runInstanceBackup` is the only
 * caller in that image).
 *
 * Every helper below is a small, deliberate duplicate of an equivalent in
 * `packages/db/src/{dialect,client}.ts` or `bin/helpers.ts`, rather than an
 * import — importing `@sovereignfs/db` would pull its whole barrel
 * (`drizzle-orm`, `cron-parser`, `@libsql/client`, the native
 * `better-sqlite3-multiple-ciphers` addon) into the bundle; importing
 * `bin/helpers.ts` would pull in `@sovereignfs/manifest` (zod, semver) the
 * same way. None of that is needed here — `citty` and `consola` (both
 * genuinely zero-dependency) are the bundle's only real dependencies.
 */
import { mkdirSync, mkdtempSync, existsSync, rmSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { defineCommand } from 'citty';
import { consola } from 'consola';

/** Mirrors packages/db/src/client.ts's findWorkspaceRoot — see this file's own doc comment for why duplicated. */
function findWorkspaceRoot(): string {
  let dir = process.cwd();
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return process.cwd();
    dir = parent;
  }
}

/** Mirrors packages/db/src/dialect.ts's resolveDialect — see this file's own doc comment for why duplicated. */
function resolveDialect(env: NodeJS.ProcessEnv = process.env): { dialect: 'sqlite' | 'postgres' } {
  const explicit = env.DB_DIALECT?.toLowerCase();
  if (explicit !== 'sqlite' && explicit !== 'postgres') {
    throw new Error(
      `DB_DIALECT is required and must be "sqlite" or "postgres" (got ${
        explicit === undefined || explicit.length === 0 ? 'unset' : `"${explicit}"`
      }).`,
    );
  }
  return { dialect: explicit };
}

/** Mirrors bin/helpers.ts's defaultArchivePath — see this file's own doc comment for why duplicated. */
function defaultArchivePath(workspaceRoot: string, version: string): string {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return join(workspaceRoot, 'backups', `sovereign-backup-${ts}-v${version}.tar.gz`);
}

/** Mirrors bin/helpers.ts's readPlatformVersion — see this file's own doc comment for why duplicated. */
function readPlatformVersion(workspaceRoot: string): string {
  try {
    const raw = readFileSync(join(workspaceRoot, 'package.json'), 'utf8');
    return (JSON.parse(raw) as { version?: string }).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const ROOT = findWorkspaceRoot();

export const backup = defineCommand({
  meta: {
    name: 'backup',
    description: 'Snapshot the platform data (databases + avatars) to a timestamped archive',
  },
  args: {
    dataDir: {
      type: 'string',
      description: 'Path to the data directory (default: ./data)',
      default: join(ROOT, 'data'),
    },
    out: {
      type: 'string',
      description: 'Output archive path (default: ./backups/sovereign-backup-<ts>-v<ver>.tar.gz)',
    },
  },
  async run({ args }) {
    const dataDir = resolve(args.dataDir);
    const version = readPlatformVersion(ROOT);
    const archivePath = resolve(args.out ?? defaultArchivePath(ROOT, version));
    const archiveDir = dirname(archivePath);

    if (!existsSync(dataDir)) {
      consola.error(`Data directory not found: ${dataDir}`);
      process.exit(1);
    }

    mkdirSync(archiveDir, { recursive: true });

    const { dialect } = resolveDialect(process.env);

    if (dialect === 'postgres') {
      // One pg_dump of the whole database — the platform's own tables
      // (public schema), the auth schema (sovereign_auth), and every
      // isolated plugin's schema (plugin_<slug>) all live in this same
      // database now, so a single dump already captures everything.
      consola.start(`Creating Postgres backup → ${archivePath}`);
      const tmp = mkdtempSync(join(archiveDir, '.sv-backup-'));
      const cleanup = (): void => rmSync(tmp, { recursive: true, force: true });
      try {
        const pgUrl = process.env.POSTGRES_DB_URL;
        if (!pgUrl) {
          cleanup();
          consola.error('DB_DIALECT=postgres requires POSTGRES_DB_URL to be set.');
          process.exit(1);
        }
        const dumpResult = spawnSync(
          'pg_dump',
          ['--format=custom', `--file=${join(tmp, 'sovereign.pgdump')}`, pgUrl],
          { stdio: 'inherit' },
        );
        if (dumpResult.status !== 0) {
          cleanup();
          consola.error('pg_dump failed.');
          process.exit(1);
        }
        // Include avatars if they exist.
        const avatarsDir = join(dataDir, 'avatars');
        const tarArgs = ['-czf', archivePath, '-C', tmp, '.'];
        if (existsSync(avatarsDir)) {
          tarArgs.push('-C', dataDir, 'avatars');
        }
        const tarResult = spawnSync('tar', tarArgs, { stdio: 'inherit' });
        cleanup();
        if (tarResult.status !== 0) {
          consola.error('tar failed creating archive.');
          process.exit(1);
        }
      } catch (err) {
        cleanup();
        throw err;
      }
    } else {
      // SQLite is sqld-backed only — its data lives in the sovereign_sqld_data
      // Docker volume, not a local directory this CLI can tar. There is no
      // automated sqld backup here yet (mirrors task 8.16's equivalent
      // Postgres gap) — point the operator at a volume-level backup instead
      // of silently producing an incomplete or empty archive.
      consola.error(
        'Automated backup for the SQLite (sqld) dialect is not implemented yet. Back up the ' +
          '`sovereign_sqld_data` Docker volume directly, e.g.:\n' +
          '  docker run --rm -v sovereign_sqld_data:/data -v "$PWD":/backup alpine ' +
          'tar -czf /backup/sqld-backup.tar.gz -C /data .',
      );
      process.exit(1);
    }

    consola.success(`Backup saved → ${archivePath}`);
  },
});

export const restore = defineCommand({
  meta: {
    name: 'restore',
    description: 'Restore a backup archive created by `sv backup`',
  },
  args: {
    archive: {
      type: 'positional',
      required: true,
      description: 'Path to the .tar.gz backup archive',
    },
    dataDir: {
      type: 'string',
      description: 'Restore destination (default: ./data)',
      default: join(ROOT, 'data'),
    },
  },
  async run({ args }) {
    const archivePath = resolve(args.archive);
    const dataDir = resolve(args.dataDir);

    if (!existsSync(archivePath)) {
      consola.error(`Archive not found: ${archivePath}`);
      process.exit(1);
    }

    mkdirSync(dataDir, { recursive: true });

    const { dialect } = resolveDialect(process.env);

    consola.warn(
      `This will overwrite data in ${dataDir}. ` +
        'Stop the server before restoring to avoid data corruption.',
    );

    if (dialect === 'postgres') {
      const pgUrl = process.env.POSTGRES_DB_URL;
      if (!pgUrl) {
        consola.error('DB_DIALECT=postgres requires POSTGRES_DB_URL to be set.');
        process.exit(1);
      }
      // Extract the dump file then pg_restore it — one database now covers
      // the platform's own tables, the auth schema, and every plugin schema
      // (see `backup`'s identical comment).
      const tmp = mkdtempSync(join(dataDir, '.sv-restore-'));
      const cleanup = (): void => rmSync(tmp, { recursive: true, force: true });
      try {
        const extractResult = spawnSync('tar', ['-xzf', archivePath, '-C', tmp], {
          stdio: 'inherit',
        });
        if (extractResult.status !== 0) {
          cleanup();
          consola.error('tar extraction failed.');
          process.exit(1);
        }

        const dumpPath = join(tmp, 'sovereign.pgdump');
        if (existsSync(dumpPath)) {
          const result = spawnSync(
            'pg_restore',
            ['--clean', '--if-exists', `--dbname=${pgUrl}`, dumpPath],
            { stdio: 'inherit' },
          );
          if (result.status !== 0) {
            cleanup();
            consola.error('pg_restore failed.');
            process.exit(1);
          }
        }

        // Restore avatars if present in the archive.
        const avatarsSrc = join(tmp, 'avatars');
        if (existsSync(avatarsSrc)) {
          rmSync(join(dataDir, 'avatars'), { recursive: true, force: true });
          const mvResult = spawnSync('mv', [avatarsSrc, join(dataDir, 'avatars')], {
            stdio: 'inherit',
          });
          if (mvResult.status !== 0) {
            cleanup();
            consola.error('Failed to restore avatars.');
            process.exit(1);
          }
        }
        cleanup();
      } catch (err) {
        cleanup();
        throw err;
      }
    } else {
      // See `backup`'s identical branch — sqld's data isn't reachable as a
      // local directory this CLI can tar/restore.
      consola.error(
        'Automated restore for the SQLite (sqld) dialect is not implemented yet. Restore the ' +
          '`sovereign_sqld_data` Docker volume directly from your own volume-level backup.',
      );
      process.exit(1);
    }

    consola.success('Restore complete. Restart the server to apply.');
  },
});
