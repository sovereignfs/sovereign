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
import { manifestDatabaseIsolation } from '@sovereignfs/manifest';

import {
  assertRemovablePlugin,
  authHealthUrl,
  defaultArchivePath,
  migrationBackupGuidance,
  pollUntilHealthy,
  readPlatformVersion,
  renderPm2Config,
  resolvePluginIdFromManifest,
  scaffoldPlugin,
} from './helpers';
import { hoistDepsForPlugin, pruneDepsForPlugin } from './plugin-deps';
import { resolveToken, withGitCredentials } from '../scripts/install-plugins';
import { loadRootEnv } from '../scripts/load-root-env';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPTS_DIR = join(ROOT, 'scripts');
const PLUGINS_DIR = join(ROOT, 'plugins');
const GENERATE = join(SCRIPTS_DIR, 'generate-registry.ts');
const INSTALL = join(SCRIPTS_DIR, 'install-plugins.ts');
const RUNTIME_PKG = join(ROOT, 'runtime', 'package.json');
const PLUGIN_DEPS_LEDGER = join(ROOT, 'runtime', 'generated', 'plugin-deps.json');

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

/** Prints `sv plugin add`'s dependency-hoisting summary (RFC 0057 §3). */
function reportHoistResult(pluginId: string, result: ReturnType<typeof hoistDepsForPlugin>): void {
  if (!result) return;
  if (result.added.length > 0) {
    consola.success(
      `Added ${result.added.length} runtime dep(s) for "${pluginId}": ${result.added.join(', ')}.`,
    );
  }
  for (const conflict of result.conflicts) {
    consola.warn(
      `"${pluginId}" wants ${conflict.name}@${conflict.incoming}, runtime already has ` +
        `${conflict.existing} (from another plugin) — kept ${conflict.kept}.`,
    );
  }
}

/** Prints `sv plugin remove`'s dependency-pruning summary (RFC 0057 §4). */
function reportPruneResult(pluginId: string, result: ReturnType<typeof pruneDepsForPlugin>): void {
  if (!result) return;
  if (result.removed.length === 0 && result.kept.length === 0) return;
  const keptNote = result.kept.length > 0 ? ` (${result.kept.length} still needed, kept)` : '';
  consola.success(
    `Removed ${result.removed.length} runtime dep(s) contributed by "${pluginId}"${keptNote}.`,
  );
}

/**
 * Archive `dataDir` to `archivePath` by tarring plain files on disk. Only
 * valid where `dataDir` genuinely holds plain-file SQLite databases: legacy
 * pre-cutover state (`db migrate-to-sqld`, RFC 0091) or a legacy per-plugin
 * `.db` file predating that plugin's migration (`db migrate-to-postgres`).
 * Not valid for the live sqld-backed SQLite dialect — sqld's data lives in
 * the `sovereign_sqld_data` Docker volume, not a local directory this
 * function can tar (see `migrationBackupGuidance` / the `backup` command's
 * own sqld branch). Paths inside the archive are relative to `dataDir`.
 * Returns whether it succeeded rather than exiting, so callers can decide
 * what "backup failed" means for them.
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
    reportHoistResult(
      id,
      hoistDepsForPlugin({
        pluginId: id,
        pluginPkgPath: join(dest, 'package.json'),
        runtimePkgPath: RUNTIME_PKG,
        ledgerPath: PLUGIN_DEPS_LEDGER,
        root: ROOT,
      }),
    );
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
    try {
      const raw = JSON.parse(readFileSync(join(dest, 'manifest.json'), 'utf8')) as {
        type?: unknown;
        id?: string;
      };
      isIsolated = manifestDatabaseIsolation(raw.type) === 'isolated';
      manifestPluginId = raw.id ?? null;
    } catch {
      // Manifest unreadable — treat as shared.
    }

    rmSync(dest, { recursive: true, force: true });
    consola.success(`Removed plugins/${id}.`);

    // RFC 0046: uninstalled plugins leave jobs cancelled, not silently
    // running/queued forever. plugin_jobs is platform-owned (not the
    // per-plugin isolated DB dropped below), so this runs unconditionally —
    // independent of isIsolated/keepData.
    if (manifestPluginId) {
      try {
        const { cancelJobsForPlugin, getPlatformDb } = await import('@sovereignfs/db');
        const pdb = await getPlatformDb();
        const cancelled = await cancelJobsForPlugin(pdb, manifestPluginId);
        if (cancelled > 0) {
          consola.info(`Cancelled ${cancelled} active job(s) for "${manifestPluginId}".`);
        }
      } catch (err) {
        consola.warn(
          `Could not cancel active jobs for "${manifestPluginId}" — ` +
            `you may need to review plugin_jobs manually. Error: ${(err as Error).message}`,
        );
      }
    }

    if (isIsolated && manifestPluginId && !keepData) {
      consola.info(`Dropping isolated database for "${manifestPluginId}"…`);
      try {
        const { dropPluginDb } = await import('@sovereignfs/db');
        await dropPluginDb(manifestPluginId);
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

    if (manifestPluginId) {
      reportPruneResult(
        manifestPluginId,
        pruneDepsForPlugin({
          pluginId: manifestPluginId,
          runtimePkgPath: RUNTIME_PKG,
          ledgerPath: PLUGIN_DEPS_LEDGER,
          root: ROOT,
        }),
      );
    } else {
      consola.warn(
        `Could not read "${id}"'s manifest id before removal — skipping runtime dependency ` +
          'cleanup. Check runtime/generated/plugin-deps.json manually if this plugin had ' +
          'external deps.',
      );
    }
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
            type?: unknown;
          };
          if (typeof m.id !== 'string') continue;
          const database = manifestDatabaseIsolation(m.type);
          pluginsWithMigrations.push({ dir: entry.name, id: m.id, database, dialect });
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
          await provisionPluginDb(id);
          const pluginDb = getPluginDb(id);
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
        'Acknowledge that no automated backup exists and proceed anyway. Required to proceed ' +
        'on both dialects: SQLite is sqld-backed (data lives in the sovereign_sqld_data Docker ' +
        'volume, not a local directory this CLI can tar) and Postgres has no automated backup ' +
        "here yet (task 8.16) — confirmation you've already taken your own volume-level " +
        '(SQLite) or `pg_dump` (Postgres) backup.',
    },
  },
  async run({ args }) {
    const {
      discoverPluginTables,
      getPlatformDb,
      getPluginDb,
      migratePluginSharedToIsolated,
      pluginMigrationsFolder,
      previewPluginTables,
      provisionPluginDb,
      resolveDialect,
      runPluginMigrations,
      sharedToIsolatedMigrationsTableName,
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

    const backupGuidance = migrationBackupGuidance(dialect);
    if (!args['skip-backup']) {
      consola.error(backupGuidance.refuseMessage);
      process.exit(1);
    } else {
      consola.warn(backupGuidance.proceedWarning);
    }

    consola.warn('Make sure the server is stopped before continuing.');

    try {
      await provisionPluginDb(manifestId);
      const pluginDb = getPluginDb(manifestId);
      if (existsSync(folder)) {
        // See sharedToIsolatedMigrationsTableName's own doc comment for why
        // this must not be pluginMigrationsTableName(manifestId) — found
        // live migrating fs.sovereign.tasks.
        const migrationsTable =
          pluginDb.dialect === 'postgres'
            ? sharedToIsolatedMigrationsTableName(manifestId)
            : undefined;
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
  async run({ args }) {
    const { resolveDialect } = await import('@sovereignfs/db');
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
  async run({ args }) {
    const { resolveDialect } = await import('@sovereignfs/db');
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

/** A file `sv db migrate-to-sqld` may act on. */
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
 * `plugin-client.ts`) would send to sqld. Every plaintext `.db` file under
 * `dataDir` is a cutover target — there is no more encryption carve-out to
 * route around (that mechanism was retired; see the platform's own tracking
 * for the deferred follow-up). A plugin `.db` file with no matching manifest
 * (orphaned/uninstalled) is still a target — if the plugin is reinstalled
 * later, leg 3 would route it to sqld anyway.
 */
async function findSqldCutoverTargets(dataDir: string): Promise<SqldCutoverTarget[]> {
  const { pluginNamespaceName } = await import('@sovereignfs/db');

  const targets: SqldCutoverTarget[] = [];

  const platformPath = join(dataDir, 'sovereign.db');
  const authPath = join(dataDir, 'auth.db');
  if (existsSync(platformPath)) {
    targets.push({ path: platformPath, kind: 'platform', namespace: undefined });
  }
  if (existsSync(authPath)) {
    // Must match apps/auth/src/db.ts's AUTH_STORE_NAME constant.
    targets.push({ path: authPath, kind: 'auth', namespace: 'sovereign_auth' });
  }

  const pluginsDir = join(dataDir, 'plugins');
  if (existsSync(pluginsDir)) {
    for (const entry of readdirSync(pluginsDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.db')) continue;
      const id = entry.name.slice(0, -'.db'.length);
      const path = join(pluginsDir, entry.name);
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
      'Start the server — it will now find the migrated data instead of creating fresh empty ' +
        'namespaces.',
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

/**
 * Whether a legacy plugin SQLite file was marked encrypted under the retired
 * RFC 0071 marker-file scheme (`data/plugins/<id>.db-encrypted`) — kept only
 * as a narrow, read-only file-existence check for this one-time migration
 * tool, not re-adding the live marker/enforcement machinery that used to
 * live in `packages/db`.
 */
function isLegacyPluginMarkedEncrypted(dataDir: string, pluginId: string): boolean {
  return existsSync(join(dataDir, 'plugins', `${pluginId}.db-encrypted`));
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
        const marked = isLegacyPluginMarkedEncrypted(dataDir, t.id);
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
        const marked = isLegacyPluginMarkedEncrypted(dataDir, t.id);
        const key = marked ? dbEncryptionKeyFromEnv() : undefined;
        if (marked && !key) {
          throw new Error(
            'This database is RFC 0071 encrypted, but SOVEREIGN_DB_ENCRYPTION_KEY is not set.',
          );
        }

        // Ensure the destination schema + tables exist, via the plugin's own
        // Postgres migrations — same mechanism the running app itself uses,
        // so the destination shape always matches what the app expects.
        await provisionPluginDb(t.id);
        const pluginDb = getPluginDb(t.id);
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

const ENCRYPT_FIELDS = join(SCRIPTS_DIR, 'encrypt-fields.ts');

const dbEncryptFields = defineCommand({
  meta: {
    name: 'encrypt-fields',
    description:
      'Backfill app-level field encryption for newly enabled sensitivity classes (RFC 0092) — ' +
      'explicit, resumable, idempotent. Take a backup first.',
  },
  args: {
    plugin: { type: 'string', description: 'Limit the backfill to one plugin id' },
  },
  run({ args }) {
    const scriptArgs = [ENCRYPT_FIELDS];
    if (args.plugin) scriptArgs.push('--plugin', args.plugin);
    run('tsx', scriptArgs);
  },
});

const db = defineCommand({
  meta: {
    name: 'db',
    description: 'sqld migration and Postgres migration tools',
  },
  subCommands: {
    'encrypt-fields': dbEncryptFields,
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

const ROTATE_FIELD_KEK = join(SCRIPTS_DIR, 'rotate-field-kek.ts');

const keysRotateFieldKek = defineCommand({
  meta: {
    name: 'rotate-field-kek',
    description:
      'Re-wrap all field-encryption DEKs under a new SOVEREIGN_FIELD_KEK (RFC 0092) — ' +
      'touches only wrapped key material, never data rows. Stop the platform first.',
  },
  args: {
    'new-key': {
      type: 'string',
      description:
        'The new KEK (base64/base64url/hex, 32 bytes). Generated and printed if omitted.',
    },
  },
  run({ args }) {
    const scriptArgs = [ROTATE_FIELD_KEK];
    if (args['new-key']) scriptArgs.push('--new-key', args['new-key']);
    run('tsx', scriptArgs);
  },
});

const ROTATE_BLIND_INDEX = join(SCRIPTS_DIR, 'rotate-blind-index.ts');

const keysRotateBlindIndex = defineCommand({
  meta: {
    name: 'rotate-blind-index',
    description:
      "Rotate a plugin's blind-index HMAC key(s) with a dual-read window (RFC 0092) — " +
      'searches keep working throughout; resumable; --status shows open windows.',
  },
  args: {
    plugin: { type: 'string', description: 'Plugin id whose keys to rotate' },
    class: { type: 'string', description: 'Limit to one sensitivity class' },
    status: { type: 'boolean', description: 'Show open rotation windows and exit' },
    force: {
      type: 'boolean',
      description: 'Complete a window even when the plugin has no registered tables',
    },
  },
  run({ args }) {
    const scriptArgs = [ROTATE_BLIND_INDEX];
    if (args.status) scriptArgs.push('--status');
    if (args.plugin) scriptArgs.push('--plugin', args.plugin);
    if (args.class) scriptArgs.push('--class', args.class);
    if (args.force) scriptArgs.push('--force');
    run('tsx', scriptArgs);
  },
});

const keys = defineCommand({
  meta: { name: 'keys', description: 'Encryption key management utilities' },
  subCommands: {
    'rotate-field-kek': keysRotateFieldKek,
    'rotate-blind-index': keysRotateBlindIndex,
  },
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
    keys,
    setup,
  },
});

void runMain(main);
