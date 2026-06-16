/**
 * Next.js instrumentation hook — runs once when the Node.js server starts,
 * before any request is handled. We use it to register the SDK host so that
 * `sdk.db`, `sdk.mailer`, and `sdk.platform` have real implementations for
 * every plugin request served by this runtime.
 *
 * The guard on NEXT_RUNTIME keeps this out of the Edge runtime context, where
 * Node.js-native packages (better-sqlite3, node-postgres) cannot load.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./src/sdk-host');
  }
}
