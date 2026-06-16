/**
 * Next.js instrumentation hook — runs once when the Node.js server starts,
 * before any request is handled. Performs two startup tasks:
 *
 * 1. Register the SDK host (`sdk.db`, `sdk.mailer`, `sdk.platform`).
 * 2. Check all installed plugins for platform-version compatibility, disable
 *    incompatible ones in the DB, and record reasons for health/admin routes.
 *
 * The guard on NEXT_RUNTIME keeps both out of the Edge runtime context, where
 * Node.js-native packages (better-sqlite3, node-postgres) cannot load.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./src/sdk-host');
    const { checkBootCompatibility } = await import('./src/boot-compat');
    await checkBootCompatibility();
  }
}
