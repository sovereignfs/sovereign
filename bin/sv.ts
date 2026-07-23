/**
 * sv — the Sovereign deployment CLI.
 *
 * A thin orchestrator: each command shells out to the existing `scripts/*.ts`
 * and `pnpm`/`turbo` rather than re-implementing their logic, so there is one
 * source of truth per operation. Run via `tsx` (no compile step), consistent
 * with the `scripts/` pattern. Canonical invocation is `pnpm sv <command>`;
 * `./bin/sv` works too via the sibling shell shim.
 *
 * Monorepo-internal in v1 — no global npm install path (SRS §2.2).
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineCommand, runMain } from 'citty';
import { consola } from 'consola';
import { manifestDatabaseDialect, manifestDatabaseIsolation } from '@sovereignfs/manifest';

import {
  assertRemovablePlugin,
  authHealthUrl,
  defaultArchivePath,
  detectDialect,
  pollUntilHealthy,
  readPlatformVersion,
  renderPm2Config,
  resolvePluginIdFromManifest,
  scaffoldPlugin,
} from './helpers';
import { resolveToken, withGitCredentials } from '../scripts/install-plugins';
import { loadRootEnv } from '../scripts/load-root-env';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPTS_DIR = join(ROOT, 'scripts');
const PLUGINS_DIR = join(ROOT, 'plugins');
const GENERATE = join(SCRIPTS_DIR, 'generate-registry.ts');
const INSTALL = join(SCRIPTS_DIR, 'install-plugins.ts');

// Load the root `.env` before any command runs — mirrors `scripts/dev.ts`.
// `sv` commands (seed, db encrypt/decrypt, user reset-mfa, …) previously read
// only `process.env`, so a value set in `.env` but not exported in the shell
// (or in a spawned child process, e.g. Playwright's `global-setup.ts` running
// `sv seed` via `execSync`) was silently invisible to them — surfacing as
// confusing key/marker-mismatch errors from `SOVEREIGN_DB_ENCRYPTION_KEY`
// despite the value being right there in `.env`. `loadRootEnv` never
// overrides a value already present in `process.env` (e.g. real env vars
// injected by Docker Compose or CI), so this is a no-op wherever `.env`
// doesn't exist or its values are already set some other way.
loadRootEnv(ROOT);

/**
 * Run a command to completion, inheriting stdio. Returns its exit code; exits
 * the CLI with that code on failure so delegated failures propagate.
 */
function run(command: string, args: string[]): void {
  const result = spawnSync(command, args, { cwd: ROOT, stdio: 'inherit' });
  if (result.error) {
    consola.error(`Failed to run \`${command}\`: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

/**
 * Archive `dataDir` to `archivePath` (SQLite path only — see the `backup`
 * command for the Postgres branch, not needed by `sv db encrypt`/`decrypt`,
 * which are SQLite-only per RFC 0071). Paths inside the archive are relative
 * to `dataDir` — see `backup`'s own comment for why. Returns whether it
 * succeeded rather than exiting, so callers (both `backup` and `db
 * encrypt`/`decrypt`) can decide what "backup failed" means for them.
 */
function runSqliteBackup(dataDir: string, archivePath: string): boolean {
  mkdirSync(dirname(archivePath), { recursive: true });
  const result = spawnSync('tar', ['-czf', archivePath, '-C', dataDir, '.'], { stdio: 'inherit' });
  return result.status === 0;
}

const install = defineCommand({
  meta: { name: 'install', description: 'Clone the plugins declared in sovereign.plugins.json' },
  run() {
    run('tsx', [INSTALL]);
  },
});

const generate = defineCommand({
  meta: { name: 'generate', description: 'Compose installed plugins into the runtime' },
  run() {
    run('tsx', [GENERATE]);
  },
});

const build = defineCommand({
  meta: { name: 'build', description: 'Compose plugins, then build all packages and apps' },
  run() {
    run('tsx', [GENERATE]);
    run('pnpm', ['build']);
  },
});

const dev = defineCommand({
  meta: { name: 'dev', description: 'Start the runtime and auth server in development mode' },
  run() {
    // `pnpm dev` (turbo) runs the runtime dev orchestrator (:3000) and the auth
    // server (:3001). It is persistent; Ctrl+C propagates via inherited stdio.
    run('pnpm', ['dev']);
  },
});

const serve = defineCommand({
  meta: { name: 'serve', description: 'Start the runtime and auth server in production mode' },
  async run() {
    // No single pnpm/turbo task starts both production servers, so orchestrate
    // the two `next start` processes directly — same mutual-teardown pattern as
    // scripts/dev.ts. Docker remains the canonical production path.
    const children = new Set<ChildProcess>();
    let shuttingDown = false;

    const shutdown = (code: number): void => {
      if (shuttingDown) return;
      shuttingDown = true;
      for (const child of children) child.kill('SIGTERM');
      process.exit(code);
    };

    const start = (args: string[], cwd: string): void => {
      // Resolve `next` from the package's own node_modules rather than relying
      // on it being on PATH (it never is for local workspace installs).
      const nextBin = join(cwd, 'node_modules', '.bin', 'next');
      const child = spawn(nextBin, args, { cwd, stdio: 'inherit' });
      children.add(child);
      child.on('exit', (code) => {
        children.delete(child);
        shutdown(code ?? 0);
      });
    };

    process.on('SIGINT', () => {
      shutdown(0);
    });
    process.on('SIGTERM', () => {
      shutdown(0);
    });

    consola.start('Starting auth server (:3001) …');
    start(['start', '--port', '3001'], join(ROOT, 'apps', 'auth'));

    const healthUrl = authHealthUrl();
    consola.info(`Waiting for auth to become healthy at ${healthUrl} …`);
    const ready = await pollUntilHealthy(healthUrl, 30_000);
    if (!ready) {
      consola.error('Auth server did not become healthy within 30 s. Aborting.');
      shutdown(1);
      return;
    }

    consola.start('Starting runtime (:3000) …');
    start(['start', '--port', '3000'], join(ROOT, 'runtime'));
  },
});

const pluginNew = defineCommand({
  meta: { name: 'new', description: 'Scaffold a new plugin from the canonical skeleton' },
  args: {
    id: {
      type: 'positional',
      required: true,
      description: 'Reverse-DNS plugin ID, e.g. io.example.my-plugin',
    },
    name: {
      type: 'string',
      description: 'Display name (default: derived from the ID)',
    },
    description: {
      type: 'string',
      description: 'Short plugin description',
    },
    route: {
      type: 'string',
      description: 'Route prefix, e.g. /my-plugin (default: /<last-id-segment>)',
    },
    out: {
      type: 'string',
      description: 'Parent directory for the new plugin (default: ./plugins inside the workspace)',
    },
  },
  run({ args }) {
    const { id } = args;
    const segments = id.split('.');
    const slug = segments.at(-1) ?? id;
    const name = args.name ?? slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    const routePrefix = args.route ?? `/${slug}`;
    const outDir = resolve(args.out ?? PLUGINS_DIR);

    if (!routePrefix.startsWith('/')) {
      consola.error(`Route prefix must start with "/": ${routePrefix}`);
      process.exit(1);
    }

    let dir: string;
    try {
      dir = scaffoldPlugin({
        id,
        name,
        description: args.description ?? '',
        routePrefix,
        outDir,
        workspaceDeps: outDir === resolve(PLUGINS_DIR),
      });
    } catch (error) {
      consola.error((error as Error).message);
      process.exit(1);
    }

    consola.success(`Scaffolded "${id}" → ${dir}`);
    consola.info('Next steps:');
    consola.info('  1. Update repository in manifest.json.');
    consola.info('  2. Run `pnpm generate` to compose the plugin into the runtime.');
    consola.info('  3. Run `pnpm dev` to start the dev server.');
  },
});

const pluginAdd = defineCommand({
  meta: { name: 'add', description: 'Clone a plugin from a git repository and compose it' },
  args: {
    repository: { type: 'positional', required: true, description: 'Git repository URL to clone' },
    'token-env': {
      type: 'string',
      description:
        'Name of an environment variable holding a personal access token, for cloning a ' +
        'private repository (requires an https:// repository URL)',
    },
  },
  run({ args }) {
    const { repository } = args;
    const tokenEnv = args['token-env'];
    let token: string | undefined;
    try {
      token = resolveToken(tokenEnv);
    } catch (error) {
      consola.error((error as Error).message);
      process.exit(1);
    }
    if (tokenEnv !== undefined && !repository.startsWith('https://')) {
      consola.error(`--token-env requires an "https://" repository URL (got "${repository}").`);
      process.exit(1);
    }

    // Clone into a temp dir inside plugins/ so the final move stays on one
    // filesystem (atomic rename), then key the destination off the manifest id.
    const tmp = mkdtempSync(join(PLUGINS_DIR, '.sv-add-'));
    const cleanup = (): void => rmSync(tmp, { recursive: true, force: true });

    const clone = withGitCredentials(repository, token, (credArgs) =>
      spawnSync('git', [...credArgs, 'clone', '--depth', '1', repository, tmp], {
        cwd: ROOT,
        stdio: 'inherit',
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      }),
    );
    if (clone.status !== 0) {
      cleanup();
      consola.error(
        `Failed to clone ${repository}. Check the URL is reachable and you have access.`,
      );
      process.exit(1);
    }

    const manifestPath = join(tmp, 'manifest.json');
    if (!existsSync(manifestPath)) {
      cleanup();
      consola.error(
        'The cloned repository has no manifest.json at its root — not a Sovereign plugin.',
      );
      process.exit(1);
    }

    let id: string;
    try {
      id = resolvePluginIdFromManifest(readFileSync(manifestPath, 'utf8'), ROOT);
    } catch (error) {
      cleanup();
      consola.error((error as Error).message);
      process.exit(1);
    }

    const dest = join(PLUGINS_DIR, id);
    if (existsSync(dest)) {
      cleanup();
      consola.error(`Plugin "${id}" is already installed (plugins/${id} exists).`);
      process.exit(1);
    }

    renameSync(tmp, dest);
    consola.success(`Installed "${id}" into plugins/${id}.`);
    run('tsx', [GENERATE]);
  },
});

const pluginRemove = defineCommand({
  meta: { name: 'remove', description: 'Remove an installed plugin and re-compose' },
  args: {
    id: { type: 'positional', required: true, description: 'Plugin directory name under plugins/' },
    'keep-data': {
      type: 'boolean',
      default: false,
      description: 'Skip dropping the isolated plugin database (data is retained on disk)',
    },
  },
  async run({ args }) {
    const { id } = args;
    const keepData = args['keep-data'];
    try {
      assertRemovablePlugin(id);
    } catch (error) {
      consola.error((error as Error).message);
      process.exit(1);
    }

    const dest = join(PLUGINS_DIR, id);
    if (!existsSync(dest)) {
      consola.error(`Plugin "${id}" is not installed (no plugins/${id}).`);
      process.exit(1);
    }

    // Read the manifest before deletion to know if the plugin used an isolated DB.
    let isIsolated = false;
    let pluginDialect: 'sqlite' | undefined;
    let manifestPluginId: string | null = null;
    try {
      const raw = JSON.parse(readFileSync(join(dest, 'manifest.json'), 'utf8')) as {
        database?: unknown;
        id?: string;
      };
      isIsolated = manifestDatabaseIsolation(raw.database) === 'isolated';
      pluginDialect = manifestDatabaseDialect(raw.database);
      manifestPluginId = raw.id ?? null;
    } catch {
      // Manifest unreadable — treat as shared.
    }

    rmSync(dest, { recursive: true, force: true });
    consola.success(`Removed plugins/${id}.`);

    if (isIsolated && manifestPluginId && !keepData) {
      consola.info(`Dropping isolated database for "${manifestPluginId}"…`);
      try {
        const { dropPluginDb } = await import('@sovereignfs/db');
        await dropPluginDb(manifestPluginId, pluginDialect);
        consola.success(`Database for "${manifestPluginId}" dropped.`);
      } catch (err) {
        consola.warn(
          `Could not drop isolated database for "${manifestPluginId}" — ` +
            `you may need to delete it manually. Error: ${(err as Error).message}`,
        );
      }
    } else if (isIsolated && manifestPluginId && keepData) {
      consola.info(
        `Kept isolated database for "${manifestPluginId}" (--keep-data). ` +
          `Run \`pnpm sv plugin drop-data ${manifestPluginId}\` to delete it later.`,
      );
    }

    run('tsx', [GENERATE]);
  },
});

const pluginMigrate = defineCommand({
  meta: {
    name: 'migrate',
    description: 'Apply pending database migrations for plugins (isolated and shared)',
  },
  args: {
    id: {
      type: 'positional',
      required: false,
      description: 'Plugin manifest ID or directory name to migrate (default: all plugins)',
    },
  },
  async run({ args }) {
    const {
      findWorkspaceRoot,
      getPluginDb,
      getPlatformDb,
      pluginMigrationsFolder,
      provisionPluginDb,
      resolveDialect,
      runPluginMigrations,
    } = await import('@sovereignfs/db');

    const root = findWorkspaceRoot();
    const pluginsRoot = join(root, 'plugins');
    const { dialect } = resolveDialect(process.env);

    // Scan plugins/ for any plugin that declares a database (isolated or shared)
    // or has no database field (defaults to shared). Reads manifests directly so
    // the command works with both installed (plugins/<id>/) and local-dev
    // (plugins/<name>.local/) directories.
    type PluginEntry = {
      dir: string;
      id: string;
      database: 'isolated' | 'shared';
      dialect: 'sqlite' | 'postgres';
    };
    const pluginsWithMigrations: PluginEntry[] = [];

    if (existsSync(pluginsRoot)) {
      for (const entry of readdirSync(pluginsRoot, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const manifestPath = join(pluginsRoot, entry.name, 'manifest.json');
        if (!existsSync(manifestPath)) continue;
        try {
          const m = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
            id?: string;
            database?: unknown;
          };
          if (typeof m.id !== 'string') continue;
          const database = manifestDatabaseIsolation(m.database);
          const pluginDialect =
            database === 'isolated' ? (manifestDatabaseDialect(m.database) ?? dialect) : dialect;
          pluginsWithMigrations.push({
            dir: entry.name,
            id: m.id,
            database,
            dialect: pluginDialect,
          });
        } catch {
          // ignore unreadable manifests
        }
      }
    }

    const targets = args.id
      ? pluginsWithMigrations.filter((p) => p.id === args.id || p.dir === args.id)
      : pluginsWithMigrations;

    if (args.id && targets.length === 0) {
      consola.error(`No plugin found with ID or directory name "${args.id}".`);
      process.exit(1);
    }

    if (targets.length === 0) {
      consola.info('No plugins with migrations found.');
      return;
    }

    let migrated = 0;
    let failed = 0;

    for (const { dir, id, database, dialect: pluginDialect } of targets) {
      const pluginDir = `plugins/${dir}`;
      const folder = pluginMigrationsFolder(pluginDir, pluginDialect);
      if (!existsSync(folder)) continue;

      consola.start(`Migrating "${id}" (${database})…`);
      try {
        if (database === 'isolated') {
          await provisionPluginDb(id, pluginDialect);
          const pluginDb = getPluginDb(id, pluginDialect);
          await runPluginMigrations(pluginDb, folder);
        } else {
          // PlatformDb is structurally identical to PluginDb ({ dialect, db }).
          // Cast via unknown: runPluginMigrations only accesses .dialect and .db,
          // both of which exist on PlatformDb.
          const pdb = await getPlatformDb();
          await runPluginMigrations(
            pdb as unknown as Parameters<typeof runPluginMigrations>[0],
            folder,
          );
        }
        consola.success(`${id}: up to date.`);
        migrated++;
      } catch (err) {
        consola.error(`${id}: ${(err as Error).message}`);
        failed++;
      }
    }

    if (failed > 0) {
      consola.error(`${failed} plugin(s) failed to migrate.`);
      process.exit(1);
    }
    consola.success(`${migrated} plugin(s) migrated successfully.`);
  },
});

const plugin = defineCommand({
  meta: { name: 'plugin', description: 'Scaffold, add, or remove individual plugins' },
  subCommands: { new: pluginNew, add: pluginAdd, remove: pluginRemove, migrate: pluginMigrate },
});

const backup = defineCommand({
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
  run({ args }) {
    const dataDir = resolve(args.dataDir);
    const version = readPlatformVersion(ROOT);
    const archivePath = resolve(args.out ?? defaultArchivePath(ROOT, version));
    const archiveDir = dirname(archivePath);

    if (!existsSync(dataDir)) {
      consola.error(`Data directory not found: ${dataDir}`);
      process.exit(1);
    }

    mkdirSync(archiveDir, { recursive: true });

    const dbUrl = process.env.DATABASE_URL ?? `file:${join(dataDir, 'sovereign.db')}`;
    const dialect = detectDialect(dbUrl);

    if (dialect === 'postgres') {
      // Postgres: use pg_dump for a consistent snapshot.
      consola.start(`Creating Postgres backup → ${archivePath}`);
      // Dump both databases to a temp directory, then tar them up.
      const tmp = mkdtempSync(join(archiveDir, '.sv-backup-'));
      const cleanup = (): void => rmSync(tmp, { recursive: true, force: true });
      try {
        const pgUrl = dbUrl;
        const authPgUrl = process.env.AUTH_DATABASE_URL ?? pgUrl.replace(/\/[^/]+$/, '/auth');
        const dumpResult = spawnSync(
          'pg_dump',
          ['--format=custom', `--file=${join(tmp, 'sovereign.pgdump')}`, pgUrl],
          { stdio: 'inherit' },
        );
        if (dumpResult.status !== 0) {
          cleanup();
          consola.error('pg_dump failed for platform database.');
          process.exit(1);
        }
        const authDumpResult = spawnSync(
          'pg_dump',
          ['--format=custom', `--file=${join(tmp, 'auth.pgdump')}`, authPgUrl],
          { stdio: 'inherit' },
        );
        if (authDumpResult.status !== 0) {
          cleanup();
          consola.error('pg_dump failed for auth database.');
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
      // SQLite: archive the whole data directory with paths *relative to it*
      // (note `-C dataDir .`). Two reasons this matters:
      //  1. Portability — the archive stores `./sovereign.db`, not an absolute
      //     host path, so `sv restore` can target any data dir, on any machine
      //     or inside a container (/app/data). Absolute paths would only restore
      //     to the exact path they were taken from.
      //  2. Consistency — it captures the `-wal`/`-shm` sidecars alongside each
      //     `.db`. In WAL mode recent commits live in the `-wal` file; backing
      //     up the `.db` alone would silently drop them. SQLite recovers from
      //     the trio on next open.
      consola.start(`Creating SQLite backup → ${archivePath}`);
      if (!runSqliteBackup(dataDir, archivePath)) {
        consola.error('tar failed creating archive.');
        process.exit(1);
      }
    }

    consola.success(`Backup saved → ${archivePath}`);
  },
});

const restore = defineCommand({
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
  run({ args }) {
    const archivePath = resolve(args.archive);
    const dataDir = resolve(args.dataDir);

    if (!existsSync(archivePath)) {
      consola.error(`Archive not found: ${archivePath}`);
      process.exit(1);
    }

    mkdirSync(dataDir, { recursive: true });

    const dbUrl = process.env.DATABASE_URL ?? `file:${join(dataDir, 'sovereign.db')}`;
    const dialect = detectDialect(dbUrl);

    consola.warn(
      `This will overwrite data in ${dataDir}. ` +
        'Stop the server before restoring to avoid data corruption.',
    );

    if (dialect === 'postgres') {
      // Extract the dump files then pg_restore them.
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

        const pgUrl = dbUrl;
        const authPgUrl = process.env.AUTH_DATABASE_URL ?? pgUrl.replace(/\/[^/]+$/, '/auth');

        for (const [dumpFile, url] of [
          ['sovereign.pgdump', pgUrl],
          ['auth.pgdump', authPgUrl],
        ] as const) {
          const dumpPath = join(tmp, dumpFile);
          if (!existsSync(dumpPath)) continue;
          const result = spawnSync(
            'pg_restore',
            ['--clean', '--if-exists', `--dbname=${url}`, dumpPath],
            { stdio: 'inherit' },
          );
          if (result.status !== 0) {
            cleanup();
            consola.error(`pg_restore failed for ${dumpFile}.`);
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
      // SQLite: extract the archive (relative paths) into the data directory.
      const extractResult = spawnSync('tar', ['-xzf', archivePath, '-C', dataDir], {
        stdio: 'inherit',
      });
      if (extractResult.status !== 0) {
        consola.error('tar extraction failed.');
        process.exit(1);
      }
    }

    consola.success('Restore complete. Restart the server to apply.');
  },
});

const dbEncrypt = defineCommand({
  meta: {
    name: 'encrypt',
    description:
      'Encrypt every SQLite database in place with SOVEREIGN_DB_ENCRYPTION_KEY (RFC 0071)',
  },
  args: {
    dataDir: {
      type: 'string',
      description: 'Path to the data directory (default: ./data)',
      default: join(ROOT, 'data'),
    },
    'skip-backup': {
      type: 'boolean',
      default: false,
      description: 'Skip the automatic pre-encryption backup (not recommended)',
    },
  },
  async run({ args }) {
    const {
      dbEncryptionKeyFromEnv,
      isEncryptionMarked,
      listInstanceSqliteFiles,
      encryptSqliteFileInPlace,
      writeEncryptionMarker,
    } = await import('@sovereignfs/db');

    const dataDir = resolve(args.dataDir);

    let key: Buffer | undefined;
    try {
      key = dbEncryptionKeyFromEnv();
    } catch (err) {
      consola.error((err as Error).message);
      process.exit(1);
    }
    if (!key) {
      consola.error(
        'SOVEREIGN_DB_ENCRYPTION_KEY is not set. Set it to the key you want to encrypt with, then re-run.',
      );
      process.exit(1);
    }

    if (isEncryptionMarked(dataDir)) {
      consola.error(
        `${dataDir} is already marked as encrypted (.db-encrypted present). Nothing to do.`,
      );
      process.exit(1);
    }

    const files = listInstanceSqliteFiles(dataDir);
    if (files.length === 0) {
      consola.warn(`No SQLite files found under ${dataDir}. Nothing to encrypt.`);
      return;
    }

    consola.info(`Found ${files.length} SQLite file(s) to encrypt:`);
    for (const f of files) consola.info(`  - ${f}`);

    if (args['skip-backup']) {
      consola.warn('Skipping the pre-encryption backup (--skip-backup). This is not recommended.');
    } else {
      const version = readPlatformVersion(ROOT);
      const archivePath = defaultArchivePath(ROOT, version);
      consola.start(`Creating a safety backup before encrypting → ${archivePath}`);
      if (!runSqliteBackup(dataDir, archivePath)) {
        consola.error('Backup failed — aborting before touching any database.');
        process.exit(1);
      }
      consola.success(`Backup saved → ${archivePath}`);
    }

    consola.warn('Make sure the server is stopped before continuing.');

    let failed = 0;
    for (const file of files) {
      consola.start(`Encrypting ${file}…`);
      try {
        encryptSqliteFileInPlace(file, key);
        consola.success(`${file}: encrypted.`);
      } catch (err) {
        consola.error(`${file}: ${(err as Error).message}`);
        failed++;
      }
    }

    if (failed > 0) {
      consola.error(
        `${failed} of ${files.length} file(s) failed to encrypt — the data directory is now in ` +
          'a mixed plaintext/encrypted state and the encryption marker was NOT written. Restore ' +
          'from the backup taken above, fix the issue (see errors above — commonly the server ' +
          'was still running), and re-run `sv db encrypt` from a clean plaintext state.',
      );
      process.exit(1);
    }

    writeEncryptionMarker(dataDir);
    consola.success(`All ${files.length} file(s) encrypted.`);
    consola.info('Restart the server with SOVEREIGN_DB_ENCRYPTION_KEY set to this same key.');
  },
});

const dbDecrypt = defineCommand({
  meta: {
    name: 'decrypt',
    description: 'Decrypt every SQLite database in place, removing at-rest encryption (RFC 0071)',
  },
  args: {
    dataDir: {
      type: 'string',
      description: 'Path to the data directory (default: ./data)',
      default: join(ROOT, 'data'),
    },
    'skip-backup': {
      type: 'boolean',
      default: false,
      description: 'Skip the automatic pre-decryption backup (not recommended)',
    },
  },
  async run({ args }) {
    const {
      dbEncryptionKeyFromEnv,
      isEncryptionMarked,
      listInstanceSqliteFiles,
      decryptSqliteFileInPlace,
      clearEncryptionMarker,
    } = await import('@sovereignfs/db');

    const dataDir = resolve(args.dataDir);

    let key: Buffer | undefined;
    try {
      key = dbEncryptionKeyFromEnv();
    } catch (err) {
      consola.error((err as Error).message);
      process.exit(1);
    }
    if (!key) {
      consola.error(
        'SOVEREIGN_DB_ENCRYPTION_KEY is not set. Set it to the CURRENT encryption key, then re-run.',
      );
      process.exit(1);
    }

    if (!isEncryptionMarked(dataDir)) {
      consola.error(`${dataDir} is not marked as encrypted. Nothing to do.`);
      process.exit(1);
    }

    const files = listInstanceSqliteFiles(dataDir);
    consola.info(`Found ${files.length} SQLite file(s) to decrypt:`);
    for (const f of files) consola.info(`  - ${f}`);

    if (args['skip-backup']) {
      consola.warn('Skipping the pre-decryption backup (--skip-backup). This is not recommended.');
    } else {
      const version = readPlatformVersion(ROOT);
      const archivePath = defaultArchivePath(ROOT, version);
      consola.start(`Creating a safety backup before decrypting → ${archivePath}`);
      if (!runSqliteBackup(dataDir, archivePath)) {
        consola.error('Backup failed — aborting before touching any database.');
        process.exit(1);
      }
      consola.success(`Backup saved → ${archivePath}`);
    }

    consola.warn('Make sure the server is stopped before continuing.');

    let failed = 0;
    for (const file of files) {
      consola.start(`Decrypting ${file}…`);
      try {
        decryptSqliteFileInPlace(file, key);
        consola.success(`${file}: decrypted.`);
      } catch (err) {
        consola.error(`${file}: ${(err as Error).message}`);
        failed++;
      }
    }

    if (failed > 0) {
      consola.error(
        `${failed} of ${files.length} file(s) failed to decrypt. Marker left in place — ` +
          'fix the issue (see errors above), or restore from the backup taken above, before retrying.',
      );
      process.exit(1);
    }

    clearEncryptionMarker(dataDir);
    consola.success(`All ${files.length} file(s) decrypted.`);
    consola.info(
      'Restart the server with SOVEREIGN_DB_ENCRYPTION_KEY unset, or run `sv db encrypt` again with a new key.',
    );
  },
});

const db = defineCommand({
  meta: { name: 'db', description: 'SQLite at-rest encryption migration tools (RFC 0071)' },
  subCommands: { encrypt: dbEncrypt, decrypt: dbDecrypt },
});

const seed = defineCommand({
  meta: {
    name: 'seed',
    description: 'Seed the dev database with test users (non-production only)',
  },
  run() {
    const result = spawnSync('pnpm', ['tsx', join(SCRIPTS_DIR, 'seed.ts')], {
      cwd: ROOT,
      stdio: 'inherit',
    });
    if (result.status !== 0) process.exit(result.status ?? 1);
  },
});

const RESET_MFA = join(SCRIPTS_DIR, 'reset-mfa.ts');

const userResetMfa = defineCommand({
  meta: {
    name: 'reset-mfa',
    description: "Clear a user's TOTP secrets and passkeys (break-glass)",
  },
  args: { email: { type: 'positional', required: true, description: "User's email address" } },
  run({ args }) {
    run('tsx', [RESET_MFA, args.email]);
  },
});

const user = defineCommand({
  meta: { name: 'user', description: 'User management utilities' },
  subCommands: { 'reset-mfa': userResetMfa },
});

const setupPm2 = defineCommand({
  meta: {
    name: 'pm2',
    description: 'Write a PM2 ecosystem config for the production standalone build',
  },
  args: {
    dir: {
      type: 'string',
      description:
        'Absolute path to the Sovereign installation directory (default: workspace root)',
    },
    'env-file': {
      type: 'string',
      description: 'Path to a .env file PM2 should load for both processes',
    },
    out: {
      type: 'string',
      description: 'Output file path (default: <dir>/ecosystem.config.js)',
    },
  },
  run({ args }) {
    const dir = resolve(args.dir ?? ROOT);
    const envFile = args['env-file'] ? resolve(args['env-file']) : undefined;
    const outPath = resolve(args.out ?? join(dir, 'ecosystem.config.js'));
    const config = renderPm2Config({ dir, envFile });
    writeFileSync(outPath, config, 'utf8');
    consola.success(`PM2 ecosystem config written to ${outPath}`);
    consola.info('Start with: pm2 start ecosystem.config.js');
    consola.info('Persist across reboots: pm2 startup && pm2 save');
  },
});

const setup = defineCommand({
  meta: { name: 'setup', description: 'Generate deployment configuration files' },
  subCommands: { pm2: setupPm2 },
});

const main = defineCommand({
  meta: { name: 'sv', description: 'Sovereign deployment CLI' },
  subCommands: {
    install,
    generate,
    build,
    dev,
    serve,
    seed,
    backup,
    restore,
    db,
    plugin,
    user,
    setup,
  },
});

void runMain(main);
