/**
 * Next.js instrumentation hook — runs once when the Node.js server starts,
 * before any request is handled. Performs startup tasks:
 *
 * 1. Apply declared plugin env-var defaults to `process.env` (RFC 0018).
 * 2. Register the SDK host (`sdk.db`, `sdk.mailer`, `sdk.platform`).
 * 3. Run per-plugin migrations for all installed plugins — isolated (own DB) and
 *    shared (platform DB) — after platform migrations have already applied (RFC 0004).
 * 4. Check all installed plugins for platform-version compatibility, disable
 *    incompatible ones in the DB, and record reasons for health/admin routes.
 * 5. Initialise the notification broker (RFC 0034).
 * 6. Start the minimal plugin scheduler (RFC 0046 Phase 1).
 *
 * (There used to be a step here that eagerly created a `plugin_status` row
 * for every non-chrome plugin on first boot — removed 2026-07-19, see
 * `./src/plugin-catalog.ts`'s file doc comment for why.)
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
    const { runAllPluginMigrations } = await import('./src/plugin-migrations');
    await runAllPluginMigrations();
    const { checkBootCompatibility } = await import('./src/boot-compat');
    await checkBootCompatibility();

    const transport = process.env.NOTIFICATION_TRANSPORT ?? 'polling';
    const redisUrl = process.env.REDIS_URL;
    const { initBroker, closeBroker } = await import('./src/notification-broker');
    const { logger } = await import('./src/logger');

    if (transport === 'sse') {
      await initBroker('sse');
      logger.info({ transport: 'sse' }, 'Notification broker: in-process SSE');
    } else if (transport === 'redis') {
      if (!redisUrl) {
        logger.error('NOTIFICATION_TRANSPORT=redis requires REDIS_URL — falling back to polling');
      } else {
        try {
          await initBroker('redis', redisUrl);
          logger.info({ transport: 'redis' }, 'Notification broker: Redis Pub/Sub');
        } catch (err) {
          logger.error(
            { err },
            'Failed to initialise Redis broker — falling back to polling. Is ioredis installed?',
          );
        }
      }
    } else {
      logger.info({ transport: 'polling' }, 'Notification broker: polling (default)');
    }

    // Minimal plugin scheduler (RFC 0046 Phase 1) — invokes the
    // manifest-declared schedule handlers composed into
    // generated/plugin-schedules.ts. No-op when nothing declares a schedule.
    const { startScheduler, stopScheduler } = await import('./src/scheduler');
    startScheduler();

    process.on('SIGTERM', () => {
      stopScheduler();
      void closeBroker();
    });
  }
}
