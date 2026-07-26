import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DbEncryptionConfigError,
  dbEncryptionKeyFromEnv,
  findWorkspaceRoot,
  getPluginDb,
  getPlatformDb,
  pluginMigrationsFolder,
  pluginMigrationsTableName,
  provisionPluginDb,
  resolveDialect,
  runPluginMigrations,
  type PluginDb,
} from '@sovereignfs/db';
import {
  manifestDatabaseDialect,
  manifestDatabaseIsolation,
  manifestRequiresEncryption,
} from '@sovereignfs/manifest';
import { registry } from '../generated/registry';
import { recordWarnings } from './plugin-compat';

/**
 * Warn (never block startup) about a plugin's `database.requireEncryption`
 * (RFC 0071) not currently being honored. Task 8.15 softened this from a
 * startup-aborting throw to a warning: the platform supports unencrypted
 * plugins as the default, and a plugin that wants encryption but can't get it
 * still runs — just unencrypted, loudly logged so an operator can act on it.
 *
 * - Postgres → warns (there is no SQLCipher equivalent for Postgres; at-rest
 *   protection falls back to disk encryption + `sslmode`).
 * - SQLite + no instance key configured → warns (this plugin's database will
 *   open in plaintext; see `getPluginDb`/`resolvePluginEncryptionKey`, which
 *   makes the same "no key → open plain" decision for real when the plugin's
 *   store is actually opened).
 * - SQLite + key configured → no-op here. Whether this plugin's *existing*
 *   file still needs a one-time `sv db encrypt` conversion is checked later,
 *   when its database is actually opened (`getPluginDb`) — that's a per-file
 *   fail-fast, not a startup-wide one, and is handled by the migration loop's
 *   own try/catch around that call, not by this function.
 * - Not required, or `shared` isolation → no-op (manifest validation already
 *   rejects `requireEncryption` on a `shared` plugin).
 *
 * Both warning paths use `recordWarnings` (not just `console.warn`) so they
 * show up persistently in Console's plugin list — a bare console line
 * vanishes from anywhere an operator would look after boot, which made this
 * kind of downgrade effectively invisible before RFC 0071 shipped.
 */
export function assertPluginEncryptionRequirement(
  pluginId: string,
  database: unknown,
  pluginDialect: 'sqlite' | 'postgres',
): void {
  if (!manifestRequiresEncryption(database)) return;

  if (pluginDialect === 'postgres') {
    const message =
      `Plugin "${pluginId}" requires database encryption, but its isolated database ` +
      'resolved to Postgres — there is no SQLCipher equivalent there. At-rest protection ' +
      'falls back to disk/volume encryption + `sslmode` for this plugin.';
    console.warn(`[sovereign] ${message}`);
    recordWarnings(pluginId, [message]);
    return;
  }

  if (dbEncryptionKeyFromEnv() === undefined) {
    const message =
      `Plugin "${pluginId}" requires database encryption, but SOVEREIGN_DB_ENCRYPTION_KEY is ` +
      'not set on this instance — its database will run unencrypted. Set the key to enable ' +
      'encryption for this plugin.';
    console.warn(`[sovereign] ${message}`);
    recordWarnings(pluginId, [message]);
  }
}

/**
 * Run pending schema migrations for all installed plugins (RFC 0004).
 *
 * Two database modes are supported:
 * - `isolated` — plugin owns a dedicated SQLite file / Postgres schema; migrations
 *   run there and never touch the platform DB.
 * - `shared` (or omitted) — plugin writes into the platform DB; migrations run
 *   there after the platform's own migrations have already applied (enforced by
 *   the call order in instrumentation.ts). Trusted first-party plugins only.
 *
 * Plugins with no `migrations/{sqlite,postgres}/` folder are skipped silently.
 * A failed plugin migration is logged but does not abort startup — the
 * compatibility check that follows will gate access to the broken plugin.
 *
 * `registry` iterates in a fixed (alphabetical, by manifest id) order, not
 * dependency or install order. Task 8.15 changed what's fatal here: a
 * plugin's unmet `database.requireEncryption` (RFC 0071) with **no key
 * configured** is no longer fatal at all — the platform supports unencrypted
 * plugins by default, so that state only warns (`assertPluginEncryptionRequirement`)
 * and the plugin runs normally, unencrypted. What *is* still fatal in
 * production is a **key configured, this plugin requires encryption, and its
 * existing file hasn't been converted yet** (`sv db encrypt` needed) — a real,
 * actionable per-plugin problem surfaced as `DbEncryptionConfigError` from
 * `getPluginDb`. Either way, one plugin's problem must not take every *other*
 * plugin down with it just because they happen to sort after it — both checks
 * are isolated in their own try/catch, collecting violations rather than
 * throwing inline. Only after every other plugin has had its migrations
 * attempted does this function throw — once — naming every plugin that
 * violated its requirement. (An earlier version of this function threw inline
 * outside the per-plugin try/catch specifically so it *would* abort — but an
 * uncaught throw inside a `for` loop aborts the whole loop, not just that
 * plugin's iteration, so every alphabetically-later plugin silently never got
 * migrated: a real incident, not a hypothetical — see
 * `docs/incidents/2026-07-24-rfc-0071-encryption-rollout.md`.)
 *
 * In development (`NODE_ENV === 'development'` exactly — never bypassed
 * under Vitest, which sets `NODE_ENV=test`) an unresolved requirement warns
 * instead of throwing, so `next dev` isn't blocked on it while iterating
 * locally. The violating plugin(s) still get no provisioning/migrations
 * either way — only the hard crash is skipped. The warning is recorded
 * per-plugin via `recordWarnings` so it's visible in Console, not just a
 * boot-time console line.
 *
 * Called from `instrumentation.ts` register() at Node.js server startup.
 */
export async function runAllPluginMigrations(): Promise<void> {
  const { dialect: platformDialect } = resolveDialect(process.env);

  // Build a map from manifest id → actual on-disk directory name.
  // `sv plugin add` names dirs after the manifest id (plugins/<id>/), but local
  // development dirs may use a different name (e.g. plugins/sovereign-tasks.local/).
  // Scanning lets both cases resolve correctly without assuming dir === id.
  const idToDir = buildIdToDirMap();
  const encryptionViolations: { pluginId: string; message: string }[] = [];

  for (const manifest of registry) {
    const isolation = manifestDatabaseIsolation(manifest.database);
    const isIsolated = isolation === 'isolated';
    const isShared = isolation === 'shared';
    if (!isIsolated && !isShared) continue;

    const dirName = idToDir.get(manifest.id) ?? manifest.id;
    const pluginDir = `plugins/${dirName}`;
    const pluginDialect = isIsolated
      ? (manifestDatabaseDialect(manifest.database) ?? platformDialect)
      : platformDialect;

    if (isIsolated) {
      try {
        assertPluginEncryptionRequirement(manifest.id, manifest.database, pluginDialect);
      } catch (err) {
        // assertPluginEncryptionRequirement no longer throws for "key not
        // configured" (task 8.15 softened that to a warning — the plugin now
        // runs unencrypted instead). An error here is unexpected; log it but
        // still let this plugin's migrations proceed below, rather than
        // repeat the original incident's mistake of one plugin's problem
        // blocking every other plugin's turn.
        console.error(
          `[sovereign] Unexpected error checking encryption requirement for plugin "${manifest.id}":`,
          err,
        );
      }
    }

    const folder = pluginMigrationsFolder(pluginDir, pluginDialect);
    if (!existsSync(folder)) continue;

    try {
      if (isIsolated) {
        await provisionPluginDb(manifest.id, pluginDialect);
        const pluginDb = getPluginDb(
          manifest.id,
          pluginDialect,
          manifestRequiresEncryption(manifest.database),
        );
        await runPluginMigrations(pluginDb, folder);
      } else {
        // PlatformDb is structurally identical to PluginDb ({ dialect, db }
        // discriminated union). The cast is safe: runPluginMigrations only
        // accesses .dialect and .db, both of which exist on PlatformDb.
        const pdb = await getPlatformDb();
        await runPluginMigrations(
          pdb as unknown as PluginDb,
          folder,
          pluginMigrationsTableName(manifest.id),
        );
      }
    } catch (err) {
      if (err instanceof DbEncryptionConfigError) {
        // The key is configured and this plugin requires encryption, but its
        // existing file hasn't been converted yet (`resolvePluginEncryptionKey`
        // inside getPluginDb) — a real, actionable per-plugin problem, not an
        // ordinary migration bug. Collect it into the same loud summary the
        // "key not configured" case used to use, scoped to this plugin only —
        // every other plugin still gets its own turn either way.
        encryptionViolations.push({ pluginId: manifest.id, message: err.message });
      } else {
        console.error(`[sovereign] Failed to run migrations for plugin "${manifest.id}":`, err);
      }
    }
  }

  if (encryptionViolations.length > 0) {
    const summary =
      `${encryptionViolations.length} plugin(s) have an unresolved database encryption ` +
      `requirement:\n${encryptionViolations.map((v) => `  - ${v.message}`).join('\n')}`;

    // Dev-only escape hatch: don't block `next dev` startup over a missing
    // SOVEREIGN_DB_ENCRYPTION_KEY. The violating plugin(s) were already
    // skipped above (no provisioning, no migrations) — that security promise
    // still holds — this only avoids a hard crash so the rest of the app is
    // usable while iterating locally. Exact match on 'development', not
    // `!== 'production'`: Vitest sets NODE_ENV=test and must keep exercising
    // the real throw path (see plugin-status.ts's bypassPluginVisibilityInDev
    // for the same convention).
    if (process.env.NODE_ENV === 'development') {
      console.warn(`[sovereign] ${summary}`);
      for (const { pluginId, message } of encryptionViolations) {
        recordWarnings(pluginId, [message]);
      }
      return;
    }

    throw new Error(summary);
  }
}

function buildIdToDirMap(): Map<string, string> {
  const map = new Map<string, string>();
  const pluginsRoot = join(findWorkspaceRoot(), 'plugins');
  if (!existsSync(pluginsRoot)) return map;

  for (const entry of readdirSync(pluginsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = join(pluginsRoot, entry.name, 'manifest.json');
    if (!existsSync(manifestPath)) continue;
    try {
      const m = JSON.parse(readFileSync(manifestPath, 'utf8')) as { id?: string };
      if (typeof m.id === 'string') map.set(m.id, entry.name);
    } catch {
      // ignore unreadable manifests — generate-registry.ts will catch them
    }
  }
  return map;
}
