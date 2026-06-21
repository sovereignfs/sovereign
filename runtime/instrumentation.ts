/**
 * Next.js instrumentation hook — runs once when the Node.js server starts,
 * before any request is handled. Performs four startup tasks:
 *
 * 1. Apply declared plugin env-var defaults to `process.env` (RFC 0018).
 * 2. Register the SDK host (`sdk.db`, `sdk.mailer`, `sdk.platform`).
 * 3. Run per-plugin migrations for any installed isolated-database plugins (RFC 0004).
 * 4. Seed default enabled/disabled state (example plugins off on first boot).
 * 5. Check all installed plugins for platform-version compatibility, disable
 *    incompatible ones in the DB, and record reasons for health/admin routes.
 *
 * The guard on NEXT_RUNTIME keeps everything out of the Edge runtime context,
 * where Node.js-native packages (better-sqlite3, node-postgres) cannot load.
 * Each import is a local module file (not a workspace package directly) so that
 * webpack does not try to bundle native deps for the Edge bundle.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { loadPluginEnv } = await import('./generated/plugin-env');
    loadPluginEnv();
    await import('./src/sdk-host');
    const { runIsolatedPluginMigrations } = await import('./src/plugin-migrations');
    await runIsolatedPluginMigrations();
    const { seedBootDefaults } = await import('./src/boot-defaults');
    await seedBootDefaults();
    const { checkBootCompatibility } = await import('./src/boot-compat');
    await checkBootCompatibility();
  }
}
