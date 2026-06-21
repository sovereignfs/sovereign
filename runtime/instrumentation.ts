/**
 * Next.js instrumentation hook — runs once when the Node.js server starts,
 * before any request is handled. Performs four startup tasks:
 *
 * 1. Apply declared plugin env-var defaults to `process.env` (RFC 0018).
 * 2. Register the SDK host (`sdk.db`, `sdk.mailer`, `sdk.platform`).
 * 3. Run per-plugin migrations for any installed isolated-database plugins (RFC 0004).
 * 4. Check all installed plugins for platform-version compatibility, disable
 *    incompatible ones in the DB, and record reasons for health/admin routes.
 *
 * The guard on NEXT_RUNTIME keeps everything out of the Edge runtime context,
 * where Node.js-native packages (better-sqlite3, node-postgres) cannot load.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { loadPluginEnv } = await import('./generated/plugin-env');
    loadPluginEnv();
    await import('./src/sdk-host');
    await runIsolatedPluginMigrations();
    const { checkBootCompatibility } = await import('./src/boot-compat');
    await checkBootCompatibility();
  }
}

async function runIsolatedPluginMigrations(): Promise<void> {
  const { existsSync } = await import('node:fs');
  const {
    getPluginDb,
    pluginMigrationsFolder,
    provisionPluginDb,
    runPluginMigrations,
    resolveDialect,
  } = await import('@sovereignfs/db');
  const { registry } = await import('./generated/registry');

  const { dialect } = resolveDialect(process.env);

  for (const manifest of registry) {
    if (manifest.database !== 'isolated') continue;

    // Derive the plugin source directory from the manifest id.
    // sv plugin add always names the dir after the manifest id, so plugins/<id>/
    // is the canonical path. If it doesn't exist (plugin removed mid-session)
    // skip silently.
    const pluginDir = `plugins/${manifest.id}`;
    const folder = pluginMigrationsFolder(pluginDir, dialect);
    if (!existsSync(folder)) continue;

    try {
      await provisionPluginDb(manifest.id);
      const pluginDb = getPluginDb(manifest.id);
      await runPluginMigrations(pluginDb, folder);
    } catch (err) {
      // Log but don't abort startup — a failed plugin migration should not take
      // the entire platform down. The compatibility check will still gate access.
      console.error(
        `[sovereign] Failed to run migrations for isolated plugin "${manifest.id}":`,
        err,
      );
    }
  }
}
