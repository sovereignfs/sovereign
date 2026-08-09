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
import { manifestDatabaseIsolation, manifestRequiresEncryption } from '@sovereignfs/manifest';

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
    let manifestPluginId: string | null = null;
    let requiresEncryption = false;
    try {
      const raw = JSON.parse(readFileSync(join(dest, 'manifest.json'), 'utf8')) as {
        database?: unknown;
        type?: unknown;
        id?: string;
      };
      isIsolated = manifestDatabaseIsolation(raw.type) === 'isolated';
      manifestPluginId = raw.id ?? null;
      requiresEncryption = manifestRequiresEncryption(raw.database);
    } catch {
      // Manifest unreadable — treat as shared.
    }

    rmSync(dest, { recursive: true, force: true });
    consola.success(`Removed plugins/${id}.`);

    if (isIsolated && manifestPluginId && !keepData) {
      consola.info(`Dropping isolated database for "${manifestPluginId}"…`);
      try {
        const { dropPluginDb } = await import('@sovereignfs/db');
        await dropPluginDb(manifestPluginId, requiresEncryption);
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
      pluginMigrationsTableName,
      provisionPluginDb,
      resolveDialect,
      runPluginMigrations,
    } = await import('@sovereignfs/db');

    const root = findWorkspaceRoot();
    const pluginsRoot = join(root, 'plugins');
    const { dialect } = resolveDialect(process.env);

    // Scan plugins/ for every plugin — every sovereign/community plugin is
    // unconditionally isolated (no manifest choice); type: "platform" plugins
    // resolve to "shared" but never have a migrations/ folder in practice.
    // Reads manifests directly so the command works with both installed
    // (plugins/<id>/) and local-dev (plugins/<name>.local/) directories.
    type PluginEntry = {
      dir: string;
      id: string;
      database: 'isolated' | 'shared';
      dialect: 'sqlite' | 'postgres';
      requiresEncryption: boolean;
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
            type?: unknown;
          };
          if (typeof m.id !== 'string') continue;
          const database = manifestDatabaseIsolation(m.type);
          pluginsWithMigrations.push({
            dir: entry.name,
            id: m.id,
            database,
            dialect,
            requiresEncryption: manifestRequiresEncryption(m.database),
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

    for (const { dir, id, database, dialect: pluginDialect, requiresEncryption } of targets) {
      const pluginDir = `plugins/${dir}`;
      const folder = pluginMigrationsFolder(pluginDir, pluginDialect);
      if (!existsSync(folder)) continue;

      consola.start(`Migrating "${id}" (${database})…`);
      try {
        if (database === 'isolated') {
          await provisionPluginDb(id, requiresEncryption);
          const pluginDb = getPluginDb(id, requiresEncryption);
          // Postgres only: drizzle's node-postgres migrator tracks applied
          // migrations in a fixed `drizzle` schema regardless of the
          // connection's search_path, so every isolated Postgres plugin
          // left on the default table name collides in that one shared
          // table. SQLite isolated plugins must keep the untouched default
          // (real history already exists under that name; a genuinely
          // separate file per plugin has no collision risk anyway) — see
          // runtime/src/plugin-migrations.ts's identical comment.
          const migrationsTable =
            pluginDb.dialect === 'postgres' ? pluginMigrationsTableName(id) : undefined;
          await runPluginMigrations(pluginDb, folder, migrationsTable);
        } else {
          // PlatformDb is structurally identical to PluginDb ({ dialect, db }).
          // Cast via unknown: runPluginMigrations only accesses .dialect and .db,
          // both of which exist on PlatformDb.
          const pdb = await getPlatformDb();
          await runPluginMigrations(
            pdb as unknown as Parameters<typeof runPluginMigrations>[0],
            folder,
            pluginMigrationsTableName(id),
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

// TRANSITIONAL TOOLING — see the note atop packages/db/src/plugin-isolation-migration.ts.
const pluginMigrateToIsolated = defineCommand({
  meta: {
    name: 'migrate-to-isolated',
    description:
      'One-time migration of a database: "shared" plugin\'s tables (living in the ' +
      'platform database) into its own dedicated isolated store (task 8.28)',
  },
  args: {
    id: {
      type: 'positional',
      required: true,
      description: 'Plugin manifest ID or directory name to migrate',
    },
    'dry-run': {
      type: 'boolean',
      default: false,
      description:
        'Report what would be migrated (tables, row counts) without touching anything or taking a backup',
    },
    'skip-backup': {
      type: 'boolean',
      default: false,
      description:
        'Skip the pre-migration backup. On a SQLite platform this skips the automatic ' +
        'data/ archive (not recommended). On a Postgres platform there is no automated ' +
        'backup here yet (task 8.16) — this flag is REQUIRED to proceed at all, as ' +
        "confirmation you've already taken your own `pg_dump` backup.",
    },
  },
  async run({ args }) {
    const {
      discoverPluginTables,
      getPlatformDb,
      getPluginDb,
      migratePluginSharedToIsolated,
      pluginMigrationsFolder,
      pluginMigrationsTableName,
      previewPluginTables,
      provisionPluginDb,
      resolveDialect,
      runPluginMigrations,
      PluginIsolationMigrationError,
    } = await import('@sovereignfs/db');

    const dest = join(PLUGINS_DIR, args.id);
    let dir = args.id;
    let manifestId = args.id;
    if (!existsSync(join(dest, 'manifest.json')) && existsSync(PLUGINS_DIR)) {
      // Allow passing the manifest id when the on-disk dir differs (e.g. a
      // `.local` dev checkout) — same resolution `pluginMigrate` uses.
      for (const entry of readdirSync(PLUGINS_DIR, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const manifestPath = join(PLUGINS_DIR, entry.name, 'manifest.json');
        if (!existsSync(manifestPath)) continue;
        try {
          const m = JSON.parse(readFileSync(manifestPath, 'utf8')) as { id?: string };
          if (m.id === args.id) {
            dir = entry.name;
            manifestId = m.id;
            break;
          }
        } catch {
          // ignore unreadable manifests
        }
      }
    } else if (existsSync(join(dest, 'manifest.json'))) {
      const m = JSON.parse(readFileSync(join(dest, 'manifest.json'), 'utf8')) as { id?: string };
      manifestId = m.id ?? args.id;
    }

    const pluginDir = `plugins/${dir}`;
    if (!existsSync(join(ROOT, pluginDir, 'manifest.json'))) {
      consola.error(`Plugin "${args.id}" is not installed (no ${pluginDir}/manifest.json).`);
      process.exit(1);
    }

    const { dialect } = resolveDialect(process.env);
    const folder = pluginMigrationsFolder(pluginDir, dialect);
    if (!existsSync(folder)) {
      consola.error(
        `${manifestId} has no migrations/${dialect}/ folder — nothing to discover tables from.`,
      );
      process.exit(1);
    }

    const tables = discoverPluginTables(folder);
    if (tables.length === 0) {
      consola.error(`No CREATE TABLE statements found under ${folder} — nothing to migrate.`);
      process.exit(1);
    }

    consola.info(`Found ${tables.length} table(s) for "${manifestId}": ${tables.join(', ')}`);

    const platformDb = await getPlatformDb();

    if (args['dry-run']) {
      consola.info('--dry-run: previewing only, nothing will be written.');
      for (const { table, rows } of await previewPluginTables(tables, platformDb)) {
        consola.info(`  ${table}: ${rows} row(s)`);
      }
      return;
    }

    if (dialect === 'sqlite') {
      if (args['skip-backup']) {
        consola.warn('Skipping the pre-migration backup (--skip-backup). This is not recommended.');
      } else {
        const version = readPlatformVersion(ROOT);
        const archivePath = defaultArchivePath(ROOT, version);
        consola.start(`Creating a safety backup before migrating → ${archivePath}`);
        if (!runSqliteBackup(join(ROOT, 'data'), archivePath)) {
          consola.error('Backup failed — aborting before touching any database.');
          process.exit(1);
        }
        consola.success(`Backup saved → ${archivePath}`);
      }
    } else if (!args['skip-backup']) {
      consola.error(
        'There is no automated Postgres backup in this CLI yet (task 8.16). Take a manual ' +
          'backup first, e.g.:\n' +
          '  pg_dump "$DATABASE_URL" > pre-migration-backup.sql\n' +
          'then re-run with --skip-backup to confirm you have one.',
      );
      process.exit(1);
    } else {
      consola.warn('--skip-backup passed — proceeding on the assumption a Postgres backup exists.');
    }

    consola.warn('Make sure the server is stopped before continuing.');

    try {
      const requiresEncryption = false; // a shared-mode plugin never had requireEncryption (schema forbids it)
      await provisionPluginDb(manifestId, requiresEncryption);
      const pluginDb = getPluginDb(manifestId, requiresEncryption);
      if (existsSync(folder)) {
        const migrationsTable =
          pluginDb.dialect === 'postgres' ? pluginMigrationsTableName(manifestId) : undefined;
        await runPluginMigrations(pluginDb, folder, migrationsTable);
      }

      const results = await migratePluginSharedToIsolated(tables, platformDb, pluginDb);
      for (const r of results) {
        consola.info(`  ${r.table}: ${r.sourceRows} -> ${r.destRows} row(s)`);
      }
      consola.success(
        `${manifestId}: migrated. The original tables in the platform database were left ` +
          'untouched — drop them manually once verified.',
      );
      consola.info(
        `Next: remove "database": "shared" from ${pluginDir}/manifest.json, bump its version, ` +
          'and redeploy.',
      );
    } catch (err) {
      if (err instanceof PluginIsolationMigrationError) {
        consola.error(err.message);
      } else {
        consola.error(`${manifestId}: ${(err as Error).message}`);
      }
      process.exit(1);
    }
  },
});

const plugin = defineCommand({
  meta: { name: 'plugin', description: 'Scaffold, add, or remove individual plugins' },
  subCommands: {
    new: pluginNew,
    add: pluginAdd,
    remove: pluginRemove,
    migrate: pluginMigrate,
    'migrate-to-isolated': pluginMigrateToIsolated,
  },
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
      //
      // tar extracts on top of the existing directory — it overwrites files
      // present in the archive but never deletes files that are merely
      // absent from it. That's a problem specifically for the RFC 0071
      // encryption marker (`data/.db-encrypted`): restoring an OLD backup
      // taken before this instance was ever encrypted (so its archive has no
      // marker) onto a CURRENTLY encrypted instance would leave the existing
      // marker in place, now pointing at freshly-restored plaintext files.
      // The next boot's `checkEncryptionMarker` would see "marker present,
      // key present" and consider that normal, then fail with a *misleading*
      // "the key is likely wrong" error when SQLCipher can't decrypt what is
      // actually just plaintext — instead of the correct, actionable
      // "convert existing plaintext instance" message. Reconcile the marker
      // against what the archive itself contains, not what's already in the
      // destination, before treating the restore as done.
      const markerPath = join(dataDir, '.db-encrypted');
      const hadMarkerBefore = existsSync(markerPath);

      const extractResult = spawnSync('tar', ['-xzf', archivePath, '-C', dataDir], {
        stdio: 'inherit',
      });
      if (extractResult.status !== 0) {
        consola.error('tar extraction failed.');
        process.exit(1);
      }

      const listing = spawnSync('tar', ['-tzf', archivePath]);
      const archiveHasMarker =
        listing.status === 0 && /(^|\/)\.db-encrypted$/m.test(listing.stdout.toString());

      if (hadMarkerBefore && !archiveHasMarker) {
        try {
          rmSync(markerPath);
        } catch {
          // Already gone — fine, that's the state we want anyway.
        }
        consola.warn(
          `This backup predates encryption (no ${markerPath} in the archive), but ` +
            `${dataDir} was previously marked as encrypted. Removed the stale marker so the ` +
            'restored plaintext data matches it — the instance will boot in plaintext. Run ' +
            '`sv db encrypt` again if you want encryption back on this restored data.',
        );
      } else if (!hadMarkerBefore && archiveHasMarker) {
        consola.info(
          'This backup was taken from an encrypted instance — the encryption marker was ' +
            'restored along with it. Make sure SOVEREIGN_DB_ENCRYPTION_KEY is set to the same ' +
            'key that backup was encrypted with before restarting.',
        );
      }
    }

    consola.success('Restore complete. Restart the server to apply.');
  },
});

/** A file `sv db encrypt`/`decrypt` may act on — the platform core (as a pair) or one plugin. */
type DbCryptTarget =
  { path: string; kind: 'core' } | { path: string; kind: 'plugin'; pluginId: string };

/** Scan each `plugins/<dir>/manifest.json` for plugins declaring `database.requireEncryption`. */
function findEncryptionRequiringPlugins(): { id: string }[] {
  const pluginsRoot = join(ROOT, 'plugins');
  const results: { id: string }[] = [];
  if (!existsSync(pluginsRoot)) return results;
  for (const entry of readdirSync(pluginsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = join(pluginsRoot, entry.name, 'manifest.json');
    if (!existsSync(manifestPath)) continue;
    try {
      const m = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
        id?: string;
        database?: unknown;
      };
      if (typeof m.id === 'string' && manifestRequiresEncryption(m.database)) {
        results.push({ id: m.id });
      }
    } catch {
      // ignore unreadable manifests
    }
  }
  return results;
}

/**
 * Every plugin `.db` file under `dataDir/plugins/` that currently has its own
 * encryption marker — including one belonging to a plugin no longer
 * installed or no longer requesting encryption (RFC 0071 open question 3:
 * data-dir scanning catches orphaned plugin databases the registry doesn't
 * list). `sv db decrypt` uses this so an orphaned encrypted file isn't stuck.
 */
function findMarkedPluginFiles(
  dataDir: string,
  isPluginEncryptionMarked: (dataDir: string, pluginId: string) => boolean,
): { id: string; path: string }[] {
  const pluginsDir = join(dataDir, 'plugins');
  const results: { id: string; path: string }[] = [];
  if (!existsSync(pluginsDir)) return results;
  for (const entry of readdirSync(pluginsDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.db')) continue;
    const id = entry.name.slice(0, -'.db'.length);
    if (isPluginEncryptionMarked(dataDir, id)) {
      results.push({ id, path: join(pluginsDir, entry.name) });
    }
  }
  return results;
}

function describeCryptTarget(t: DbCryptTarget): string {
  return t.kind === 'plugin' ? `${t.path} (plugin: ${t.pluginId})` : `${t.path} (platform core)`;
}

const dbEncrypt = defineCommand({
  meta: {
    name: 'encrypt',
    description:
      'Encrypt the platform core, plus any plugin database that requests it via its manifest (RFC 0071, task 8.15)',
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
      isPluginEncryptionMarked,
      encryptSqliteFileInPlace,
      writeEncryptionMarker,
      writePluginEncryptionMarker,
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

    // Core: always the goal once a key is present — only skip a file that's
    // already marked, or a pair member that doesn't exist (Postgres auth.db
    // deployments etc).
    const coreNeedsEncryption = !isEncryptionMarked(dataDir);
    const coreFiles = coreNeedsEncryption
      ? ['sovereign.db', 'auth.db'].map((name) => join(dataDir, name)).filter((p) => existsSync(p))
      : [];

    // Plugins: only ones that explicitly request it via manifest, and whose
    // file exists and isn't already marked.
    const pluginTargets = findEncryptionRequiringPlugins()
      .map(({ id }) => ({ id, path: join(dataDir, 'plugins', `${id}.db`) }))
      .filter((p) => existsSync(p.path) && !isPluginEncryptionMarked(dataDir, p.id));

    const targets: DbCryptTarget[] = [
      ...coreFiles.map((path): DbCryptTarget => ({ path, kind: 'core' })),
      ...pluginTargets.map((p): DbCryptTarget => ({
        path: p.path,
        kind: 'plugin',
        pluginId: p.id,
      })),
    ];

    if (targets.length === 0) {
      consola.info(
        'Nothing to encrypt — the platform core is already encrypted (or has no files yet), ' +
          'and no plugin that requests encryption has an unconverted database.',
      );
      return;
    }

    consola.info(`Found ${targets.length} SQLite file(s) to encrypt:`);
    for (const t of targets) consola.info(`  - ${describeCryptTarget(t)}`);

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
    let coreSucceeded = true;
    for (const t of targets) {
      consola.start(`Encrypting ${t.path}…`);
      try {
        encryptSqliteFileInPlace(t.path, key);
        // Mark immediately, per file — a plugin's success doesn't depend on
        // any other target in this batch, core or sibling plugin.
        if (t.kind === 'plugin') writePluginEncryptionMarker(dataDir, t.pluginId);
        consola.success(`${t.path}: encrypted.`);
      } catch (err) {
        consola.error(`${t.path}: ${(err as Error).message}`);
        failed++;
        if (t.kind === 'core') coreSucceeded = false;
      }
    }

    // Core is all-or-nothing (sovereign.db and auth.db share one marker) —
    // only write it if every core file in this run actually succeeded.
    if (coreNeedsEncryption && coreFiles.length > 0 && coreSucceeded) {
      writeEncryptionMarker(dataDir);
    }

    if (failed > 0) {
      consola.error(
        `${failed} of ${targets.length} file(s) failed to encrypt. Files that succeeded were ` +
          'marked as encrypted individually — re-run `sv db encrypt` after fixing the issue (see ' +
          'errors above — commonly the server was still running); it will only retry what ' +
          'remains unconverted, not what already succeeded. Restore from the backup taken above ' +
          'if anything looks inconsistent.',
      );
      process.exit(1);
    }

    consola.success(`All ${targets.length} file(s) encrypted.`);
    consola.info('Restart the server with SOVEREIGN_DB_ENCRYPTION_KEY set to this same key.');
  },
});

const dbDecrypt = defineCommand({
  meta: {
    name: 'decrypt',
    description:
      'Decrypt the platform core and any encrypted plugin database, removing at-rest encryption (RFC 0071)',
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
      isPluginEncryptionMarked,
      decryptSqliteFileInPlace,
      clearEncryptionMarker,
      clearPluginEncryptionMarker,
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

    const coreMarked = isEncryptionMarked(dataDir);
    const coreFiles = coreMarked
      ? ['sovereign.db', 'auth.db'].map((name) => join(dataDir, name)).filter((p) => existsSync(p))
      : [];

    // Every plugin file with its own marker — including an orphaned one no
    // longer requesting encryption or no longer installed, so decrypt can
    // always reverse whatever encrypt actually did.
    const pluginTargets = findMarkedPluginFiles(dataDir, isPluginEncryptionMarked);

    const targets: DbCryptTarget[] = [
      ...coreFiles.map((path): DbCryptTarget => ({ path, kind: 'core' })),
      ...pluginTargets.map((p): DbCryptTarget => ({
        path: p.path,
        kind: 'plugin',
        pluginId: p.id,
      })),
    ];

    if (targets.length === 0) {
      consola.error(`${dataDir} has nothing marked as encrypted. Nothing to do.`);
      process.exit(1);
    }

    consola.info(`Found ${targets.length} SQLite file(s) to decrypt:`);
    for (const t of targets) consola.info(`  - ${describeCryptTarget(t)}`);

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
    let coreSucceeded = true;
    for (const t of targets) {
      consola.start(`Decrypting ${t.path}…`);
      try {
        decryptSqliteFileInPlace(t.path, key);
        if (t.kind === 'plugin') clearPluginEncryptionMarker(dataDir, t.pluginId);
        consola.success(`${t.path}: decrypted.`);
      } catch (err) {
        consola.error(`${t.path}: ${(err as Error).message}`);
        failed++;
        if (t.kind === 'core') coreSucceeded = false;
      }
    }

    if (coreMarked && coreSucceeded) clearEncryptionMarker(dataDir);

    if (failed > 0) {
      consola.error(
        `${failed} of ${targets.length} file(s) failed to decrypt. Markers for files that ` +
          'succeeded were already cleared — fix the issue (see errors above), or restore from ' +
          'the backup taken above, before retrying.',
      );
      process.exit(1);
    }

    consola.success(`All ${targets.length} file(s) decrypted.`);
    consola.info(
      'Restart the server with SOVEREIGN_DB_ENCRYPTION_KEY unset, or run `sv db encrypt` again with a new key.',
    );
  },
});

/** A file `sv db migrate-to-sqld` may act on — mirrors `DbCryptTarget`'s shape. */
type SqldCutoverTarget =
  | { path: string; kind: 'platform'; namespace: undefined }
  | { path: string; kind: 'auth'; namespace: string }
  | { path: string; kind: 'plugin'; pluginId: string; namespace: string };

function describeCutoverTarget(t: SqldCutoverTarget): string {
  if (t.kind === 'plugin') return `${t.path} (plugin: ${t.pluginId} → namespace "${t.namespace}")`;
  if (t.kind === 'auth') return `${t.path} (auth core → namespace "${t.namespace}")`;
  return `${t.path} (platform core → default namespace)`;
}

/**
 * Determine every SQLite file leg 3's routing (`packages/db/src/client.ts`,
 * `plugin-client.ts`) would send to sqld — the RFC 0091 encryption carve-out
 * in reverse. Ground truth is each file's own on-disk marker
 * (`isEncryptionMarked`/`isPluginEncryptionMarked`), not just the current
 * manifest/env state:
 *
 * - A file already marked encrypted is never a target — it's staying
 *   plain-file, untouched by this leg entirely.
 * - A plaintext file whose *current* config says it should be encrypted
 *   (platform: `SOVEREIGN_DB_ENCRYPTION_KEY` set; plugin: manifest
 *   `requireEncryption: true`) is a stuck, not-yet-converted state — the
 *   same one `checkEncryptionMarker`/`resolvePluginEncryptionKey` already
 *   refuse to boot from. Skip it here too: cutting it over to sqld would be
 *   actively wrong, since the runtime will keep looking for it as a
 *   plain file regardless. `sv db encrypt` is the fix for that state, not
 *   this command.
 * - Everything else plaintext is a genuine cutover target.
 *
 * A plugin `.db` file with no matching manifest (orphaned/uninstalled) is
 * still a target — there's no active `requireEncryption` to stop it, and if
 * the plugin is reinstalled later without it, leg 3 would route it to sqld
 * anyway.
 */
async function findSqldCutoverTargets(dataDir: string): Promise<SqldCutoverTarget[]> {
  const {
    dbEncryptionKeyFromEnv,
    isEncryptionMarked,
    isPluginEncryptionMarked,
    pluginNamespaceName,
  } = await import('@sovereignfs/db');

  const targets: SqldCutoverTarget[] = [];

  if (!isEncryptionMarked(dataDir)) {
    const keySet = dbEncryptionKeyFromEnv() !== undefined;
    const platformPath = join(dataDir, 'sovereign.db');
    const authPath = join(dataDir, 'auth.db');
    if (!keySet) {
      if (existsSync(platformPath)) {
        targets.push({ path: platformPath, kind: 'platform', namespace: undefined });
      }
      if (existsSync(authPath)) {
        targets.push({ path: authPath, kind: 'auth', namespace: 'auth' });
      }
    }
  }

  const requiresEncryption = new Set(findEncryptionRequiringPlugins().map((p) => p.id));
  const pluginsDir = join(dataDir, 'plugins');
  if (existsSync(pluginsDir)) {
    for (const entry of readdirSync(pluginsDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.db')) continue;
      const id = entry.name.slice(0, -'.db'.length);
      const path = join(pluginsDir, entry.name);
      if (isPluginEncryptionMarked(dataDir, id)) continue;
      if (requiresEncryption.has(id)) continue;
      targets.push({ path, kind: 'plugin', pluginId: id, namespace: pluginNamespaceName(id) });
    }
  }

  return targets;
}

// TRANSITIONAL TOOLING — see the note atop packages/db/src/sqld-cutover.ts.
const dbMigrateToSqld = defineCommand({
  meta: {
    name: 'migrate-to-sqld',
    description:
      'One-time cutover of existing plain-file SQLite databases onto sqld (RFC 0091, workstream 0009 leg 4)',
  },
  args: {
    dataDir: {
      type: 'string',
      description: 'Path to the data directory (default: ./data)',
      default: join(ROOT, 'data'),
    },
    'dry-run': {
      type: 'boolean',
      default: false,
      description:
        'Report what would be migrated (files, tables, row counts) without touching sqld or taking a backup',
    },
    'skip-backup': {
      type: 'boolean',
      default: false,
      description: 'Skip the automatic pre-cutover backup (not recommended)',
    },
  },
  async run({ args }) {
    const dataDir = resolve(args.dataDir);
    const targets = await findSqldCutoverTargets(dataDir);

    if (targets.length === 0) {
      consola.info(
        'Nothing to migrate — every plain-file SQLite database here is either already ' +
          'encrypted or has no pending sqld cutover.',
      );
      return;
    }

    consola.info(`Found ${targets.length} SQLite file(s) to migrate to sqld:`);
    for (const t of targets) consola.info(`  - ${describeCutoverTarget(t)}`);

    const { previewSqliteFile } = await import('@sovereignfs/db');

    if (args['dry-run']) {
      consola.info('--dry-run: previewing only, nothing will be written.');
      for (const t of targets) {
        const preview = previewSqliteFile(t.path);
        consola.info(`  ${t.path}:`);
        for (const { table, rows } of preview) {
          consola.info(`    ${table}: ${rows} row(s)`);
        }
      }
      return;
    }

    if (args['skip-backup']) {
      consola.warn('Skipping the pre-cutover backup (--skip-backup). This is not recommended.');
    } else {
      const version = readPlatformVersion(ROOT);
      const archivePath = defaultArchivePath(ROOT, version);
      consola.start(`Creating a safety backup before cutover → ${archivePath}`);
      if (!runSqliteBackup(dataDir, archivePath)) {
        consola.error('Backup failed — aborting before touching any database.');
        process.exit(1);
      }
      consola.success(`Backup saved → ${archivePath}`);
    }

    consola.warn('Make sure the server is stopped before continuing.');

    const {
      createSqldClient,
      cutoverSqliteFileToSqld,
      provisionSqldNamespace,
      sqldAdminUrl,
      sqldUrl,
      SqldCutoverError,
    } = await import('@sovereignfs/db');

    let failed = 0;
    for (const t of targets) {
      consola.start(`Migrating ${t.path}…`);
      try {
        if (t.kind !== 'platform') {
          await provisionSqldNamespace(sqldAdminUrl(process.env), t.namespace);
        }
        const client = createSqldClient(
          sqldUrl(process.env),
          t.kind === 'platform' ? undefined : t.namespace,
        );
        const results = await cutoverSqliteFileToSqld(t.path, client);

        let mismatched = false;
        for (const r of results) {
          const ok = r.sourceRows === r.destRows;
          if (!ok) mismatched = true;
          consola.info(
            `    ${r.table}: ${r.sourceRows} → ${r.destRows} row(s)${ok ? '' : ' — MISMATCH'}`,
          );
        }
        if (mismatched) {
          throw new Error(
            'Post-cutover row counts do not match the source — this should not happen given ' +
              "client.migrate()'s atomicity; treat the destination namespace as suspect.",
          );
        }
        consola.success(`${t.path}: migrated.`);
      } catch (err) {
        const message = err instanceof SqldCutoverError ? err.message : (err as Error).message;
        consola.error(`${t.path}: ${message}`);
        failed++;
      }
    }

    if (failed > 0) {
      consola.error(
        `${failed} of ${targets.length} file(s) failed to migrate. Files that succeeded are ` +
          'live in sqld; the ones that failed were left completely untouched (their plain files ' +
          'are unmodified). Fix the issue (see errors above), or restore from the backup taken ' +
          'above, before retrying.',
      );
      process.exit(1);
    }

    consola.success(`All ${targets.length} file(s) migrated to sqld.`);
    consola.info(
      'Start the server with the sqld overlay attached (docker-compose.sqld.yml) — it will now ' +
        'find the migrated data instead of creating fresh empty namespaces.',
    );
  },
});

/**
 * Every isolated plugin with a pending legacy SQLite file under
 * `dataDir/plugins/` — a plugin whose `.db` file exists on disk despite the
 * platform dialect being Postgres, left behind by a per-plugin
 * `database.dialect: "sqlite"` override from before that manifest field was
 * removed (workstream 0009 leg 1). Only plugins actually present in
 * `plugins/` (matched by manifest id) and not `type: "platform"` are
 * targets — an orphaned `.db` file with no matching manifest has no
 * Postgres migrations to run against, so it's skipped, not migrated.
 */
function findPostgresMigrationTargets(
  dataDir: string,
): { id: string; dir: string; path: string }[] {
  const pluginsDataDir = join(dataDir, 'plugins');
  if (!existsSync(pluginsDataDir)) return [];

  const idToDir = new Map<string, string>();
  if (existsSync(PLUGINS_DIR)) {
    for (const entry of readdirSync(PLUGINS_DIR, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const manifestPath = join(PLUGINS_DIR, entry.name, 'manifest.json');
      if (!existsSync(manifestPath)) continue;
      try {
        const m = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
          id?: string;
          type?: unknown;
        };
        if (typeof m.id === 'string' && manifestDatabaseIsolation(m.type) === 'isolated') {
          idToDir.set(m.id, entry.name);
        }
      } catch {
        // ignore unreadable manifests
      }
    }
  }

  const targets: { id: string; dir: string; path: string }[] = [];
  for (const entry of readdirSync(pluginsDataDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.db')) continue;
    const id = entry.name.slice(0, -'.db'.length);
    const dir = idToDir.get(id);
    if (!dir) continue;
    targets.push({ id, dir, path: join(pluginsDataDir, entry.name) });
  }
  return targets;
}

// TRANSITIONAL TOOLING — see the note atop packages/db/src/postgres-migration.ts.
const dbMigrateToPostgres = defineCommand({
  meta: {
    name: 'migrate-to-postgres',
    description:
      'One-time migration of a legacy isolated-plugin SQLite database into its Postgres schema',
  },
  args: {
    pluginId: {
      type: 'positional',
      required: false,
      description:
        'Plugin manifest ID or directory name to migrate (default: every isolated plugin with a pending SQLite file)',
    },
    dataDir: {
      type: 'string',
      description: 'Path to the data directory (default: ./data)',
      default: join(ROOT, 'data'),
    },
    'dry-run': {
      type: 'boolean',
      default: false,
      description:
        'Report what would be migrated (tables, row counts) without touching Postgres or taking a backup',
    },
    'skip-backup': {
      type: 'boolean',
      default: false,
      description: 'Skip the automatic pre-migration backup (not recommended)',
    },
  },
  async run({ args }) {
    const {
      dbEncryptionKeyFromEnv,
      getPluginDb,
      isPluginEncryptionMarked,
      migratePluginSqliteToPostgres,
      pluginMigrationsFolder,
      pluginMigrationsTableName,
      pluginSchemaName,
      previewSqliteFileForPostgres,
      provisionPluginDb,
      resolveDialect,
      runPluginMigrations,
      PostgresMigrationError,
    } = await import('@sovereignfs/db');

    const { dialect } = resolveDialect(process.env);
    if (dialect !== 'postgres') {
      consola.error(
        'This command migrates a legacy SQLite plugin database into Postgres — DB_DIALECT is ' +
          `"${dialect}", not "postgres". Nothing to do.`,
      );
      process.exit(1);
    }

    const dataDir = resolve(args.dataDir);
    const allTargets = findPostgresMigrationTargets(dataDir);
    const targets = args.pluginId
      ? allTargets.filter((t) => t.id === args.pluginId || t.dir === args.pluginId)
      : allTargets;

    if (args.pluginId && targets.length === 0) {
      consola.error(
        `No pending SQLite migration found for "${args.pluginId}" — either it has no ` +
          'data/plugins/<id>.db file, or it is not an installed isolated plugin.',
      );
      process.exit(1);
    }

    if (targets.length === 0) {
      consola.info('Nothing to migrate — no isolated plugin has a pending legacy SQLite file.');
      return;
    }

    consola.info(`Found ${targets.length} plugin(s) with a pending SQLite → Postgres migration:`);
    for (const t of targets) consola.info(`  - ${t.id} (${t.path})`);

    if (args['dry-run']) {
      consola.info('--dry-run: previewing only, nothing will be written.');
      for (const t of targets) {
        const marked = isPluginEncryptionMarked(dataDir, t.id);
        const key = marked ? dbEncryptionKeyFromEnv() : undefined;
        if (marked && !key) {
          consola.warn(
            `  ${t.id}: encrypted, but SOVEREIGN_DB_ENCRYPTION_KEY is not set — skipping preview.`,
          );
          continue;
        }
        consola.info(`  ${t.id}:`);
        for (const { table, rows } of previewSqliteFileForPostgres(t.path, key)) {
          consola.info(`    ${table}: ${rows} row(s)`);
        }
      }
      return;
    }

    if (args['skip-backup']) {
      consola.warn('Skipping the pre-migration backup (--skip-backup). This is not recommended.');
    } else {
      const version = readPlatformVersion(ROOT);
      const archivePath = defaultArchivePath(ROOT, version);
      consola.start(`Creating a safety backup before migrating → ${archivePath}`);
      if (!runSqliteBackup(dataDir, archivePath)) {
        consola.error('Backup failed — aborting before touching any database.');
        process.exit(1);
      }
      consola.success(`Backup saved → ${archivePath}`);
    }

    consola.warn('Make sure the server is stopped before continuing.');

    let failed = 0;
    for (const t of targets) {
      consola.start(`Migrating "${t.id}"…`);
      try {
        const marked = isPluginEncryptionMarked(dataDir, t.id);
        const key = marked ? dbEncryptionKeyFromEnv() : undefined;
        if (marked && !key) {
          throw new Error(
            'This database is RFC 0071 encrypted, but SOVEREIGN_DB_ENCRYPTION_KEY is not set.',
          );
        }

        // Ensure the destination schema + tables exist, via the plugin's own
        // Postgres migrations — same mechanism the running app itself uses,
        // so the destination shape always matches what the app expects.
        await provisionPluginDb(t.id, false);
        const pluginDb = getPluginDb(t.id, false);
        const folder = pluginMigrationsFolder(`plugins/${t.dir}`, 'postgres');
        if (existsSync(folder)) {
          // Always Postgres here (asserted above) — drizzle's node-postgres
          // migrator tracks applied migrations in a fixed `drizzle` schema
          // regardless of the connection's search_path, so every isolated
          // Postgres plugin left on the default table name collides in that
          // one shared table with every other one. See
          // runtime/src/plugin-migrations.ts's identical comment for the
          // full story — found live, migrating this exact plugin set.
          await runPluginMigrations(pluginDb, folder, pluginMigrationsTableName(t.id));
        }
        if (pluginDb.dialect !== 'postgres') {
          throw new Error(`Expected a Postgres connection for "${t.id}"; got ${pluginDb.dialect}.`);
        }

        const results = await migratePluginSqliteToPostgres(
          t.path,
          pluginDb.db.$client,
          pluginSchemaName(t.id),
          key,
        );

        let mismatched = false;
        for (const r of results) {
          const ok = r.sourceRows === r.destRows;
          if (!ok) mismatched = true;
          consola.info(
            `    ${r.table}: ${r.sourceRows} → ${r.destRows} row(s)${ok ? '' : ' — MISMATCH'}`,
          );
        }
        if (mismatched) {
          throw new Error(
            'Post-migration row counts do not match the source — this should not happen given ' +
              'the transactional copy; treat the destination schema as suspect.',
          );
        }
        consola.success(`${t.id}: migrated. The original SQLite file was left untouched.`);
      } catch (err) {
        const message =
          err instanceof PostgresMigrationError ? err.message : (err as Error).message;
        consola.error(`${t.id}: ${message}`);
        failed++;
      }
    }

    if (failed > 0) {
      consola.error(
        `${failed} of ${targets.length} plugin(s) failed to migrate. Plugins that succeeded are ` +
          'live in Postgres; the ones that failed were left completely untouched. Fix the issue ' +
          '(see errors above), or restore from the backup taken above, before retrying.',
      );
      process.exit(1);
    }

    consola.success(`All ${targets.length} plugin(s) migrated to Postgres.`);
    consola.info(
      'Once verified, the original SQLite files under data/plugins/ can be safely removed — ' +
        'they were left untouched by this migration.',
    );
  },
});

const db = defineCommand({
  meta: {
    name: 'db',
    description: 'SQLite at-rest encryption, sqld migration, and Postgres migration tools',
  },
  subCommands: {
    encrypt: dbEncrypt,
    decrypt: dbDecrypt,
    'migrate-to-sqld': dbMigrateToSqld,
    'migrate-to-postgres': dbMigrateToPostgres,
  },
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
