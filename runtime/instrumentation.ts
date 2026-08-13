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
 * 7. Start the plugin job worker (RFC 0046).
 *
 * (There used to be a step here that eagerly created a `plugin_status` row
 * for every non-chrome plugin on first boot — removed 2026-07-19, see
 * `./src/plugin-catalog.ts`'s file doc comment for why.)
 *
 * The guard on NEXT_RUNTIME keeps everything out of the Edge runtime context,
 * where Node.js-native packages (better-sqlite3-multiple-ciphers, node-postgres) cannot load.
 * Each import is a local module file (not a workspace package directly) so that
 * webpack does not try to bundle native deps for the Edge bundle.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { loadPluginEnv } = await import('./generated/plugin-env');
    loadPluginEnv();
    // Field-encryption boot guard (RFC 0092): SOVEREIGN_ENCRYPT_CLASSES set
    // without SOVEREIGN_FIELD_KEK (or a malformed KEK) must fail startup
    // loudly, before any request — never a silent plaintext fallback.
    const { assertFieldEncryptionConfig } = await import('./src/field-encryption-keys');
    assertFieldEncryptionConfig();
    await import('./src/sdk-host');
    const { runAllPluginMigrations } = await import('./src/plugin-migrations');
    await runAllPluginMigrations();
    const { checkBootCompatibility } = await import('./src/boot-compat');
    await checkBootCompatibility();

    // RFC 0092 gate B "never indefinite": surface abandoned blind-index
    // rotation windows (older than 7 days) on every boot.
    const { warnStaleHmacRotations } = await import('./src/field-reseal');
    const { logger: bootLogger } = await import('./src/logger');
    try {
      for (const warning of await warnStaleHmacRotations()) {
        bootLogger.warn(warning);
      }
    } catch {
      // Best-effort — a fresh instance without the table yet must still boot.
    }

    const transport = process.env.NOTIFICATION_TRANSPORT ?? 'sse';
    const redisUrl = process.env.REDIS_URL;
    const { initBroker, closeBroker } = await import('./src/notification-broker');
    const { logger } = await import('./src/logger');

    if (transport === 'sse') {
      await initBroker('sse');
      logger.info('Notification broker: in-process SSE', { transport: 'sse' });
    } else if (transport === 'redis') {
      if (!redisUrl) {
        logger.error('NOTIFICATION_TRANSPORT=redis requires REDIS_URL — falling back to polling');
      } else {
        try {
          await initBroker('redis', redisUrl);
          logger.info('Notification broker: Redis Pub/Sub', { transport: 'redis' });
        } catch (err) {
          logger.error(
            'Failed to initialise Redis broker — falling back to polling. Is ioredis installed?',
            { err },
          );
        }
      }
    } else {
      logger.info('Notification broker: polling (default)', { transport: 'polling' });
    }

    // Minimal plugin scheduler (RFC 0046 Phase 1) — invokes the
    // manifest-declared schedule handlers composed into
    // generated/plugin-schedules.ts. No-op when nothing declares a schedule.
    const { startScheduler, stopScheduler } = await import('./src/scheduler');
    startScheduler();

    // Plugin job worker (RFC 0046) — claims and runs jobs enqueued/scheduled
    // via sdk.jobs, composed into generated/plugin-jobs.ts. No-op when
    // nothing declares a job type.
    const { startJobWorker, stopJobWorker } = await import('./src/jobs');
    startJobWorker();

    process.on('SIGTERM', () => {
      stopScheduler();
      stopJobWorker();
      void closeBroker();
    });
  }
}
