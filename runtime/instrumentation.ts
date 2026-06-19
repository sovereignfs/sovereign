/**
 * Next.js instrumentation hook — runs once when the Node.js server starts,
 * before any request is handled. Performs three startup tasks:
 *
 * 1. Apply declared plugin env-var defaults to `process.env` (RFC 0018).
 * 2. Register the SDK host (`sdk.db`, `sdk.mailer`, `sdk.platform`).
 * 3. Check all installed plugins for platform-version compatibility, disable
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
    const { checkBootCompatibility } = await import('./src/boot-compat');
    await checkBootCompatibility();
  }
}
