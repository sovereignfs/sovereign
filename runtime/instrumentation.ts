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
 *    Fault-isolated at two layers: the call site here is wrapped in
 *    try/catch (a thrown/rejected checkBootCompatibility() is logged and
 *    boot continues), and checkBootCompatibility() itself isolates each
 *    plugin's own check so one plugin's fault doesn't stop the rest from
 *    being evaluated.
 * 5. Initialise the notification broker (RFC 0034).
 * 6. Start the minimal plugin scheduler (RFC 0046 Phase 1).
 * 7. Start the plugin job worker (RFC 0046).
 * 8. Start the backup job worker (RFC 0084).
 * 9. Initialise the realtime event broker (RFC 0045).
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
    // Wrapped in try/catch, mirroring the scheduler/job-worker blocks below:
    // checkBootCompatibility() calls getPlatformDb() and setPluginEnabled()
    // (real DB calls that can throw, including the class of Postgres
    // connectivity trouble this codebase's own incident history shows
    // actually happens in production) and checkCompatibility(), whose
    // semver.gt() calls throw on a malformed minPlatformVersion/
    // maxPlatformVersion string. Uncaught, any of this previously aborted
    // register() before the scheduler/job-worker/backup-worker/event-broker
    // steps below ever ran -- reopening the "one fault kills all of boot"
    // failure mode those steps' own try/catch blocks exist to prevent, one
    // call earlier in the same function. console.error, not the structured
    // logger, since logger's own dynamic import doesn't happen until below.
    const { checkBootCompatibility } = await import('./src/boot-compat');
    try {
      await checkBootCompatibility();
    } catch (err) {
      console.error('Failed to check plugin boot compatibility — continuing boot', err);
    }

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
    //
    // Wrapped in try/catch: this dynamic import statically resolves every
    // declared plugin's schedule handler — and that handler's own full
    // transitive import graph — as part of loading
    // generated/plugin-schedules.ts. A fault anywhere in that graph (a
    // plugin dependency missing from runtime/package.json, a syntax error,
    // anything) throws here, and this was previously uncaught: it aborted
    // this whole async register() before startJobWorker/the event broker/etc.
    // below ever ran, taking the entire platform down at boot over one
    // plugin's schedule handler. Mirrors runAllPluginMigrations()'s own
    // per-plugin isolation (added after the RFC 0071 incident — see
    // docs/incidents/) in spirit, though coarser here: PLUGIN_SCHEDULES is
    // one statically-imported array, not a per-plugin call site, so a
    // broken handler disables the whole scheduler subsystem for this
    // process rather than just its own plugin's schedule. Coarser but far
    // better than the alternative — every other plugin's pages/actions, the
    // job worker below, and the rest of boot all still complete normally.
    let stopScheduler: () => void = () => {};
    try {
      const scheduler = await import('./src/scheduler');
      stopScheduler = scheduler.stopScheduler;
      scheduler.startScheduler();
    } catch (err) {
      logger.error('Failed to start plugin scheduler — no schedules will run this process', {
        err,
      });
    }

    // Plugin job worker (RFC 0046) — claims and runs jobs enqueued/scheduled
    // via sdk.jobs, composed into generated/plugin-jobs.ts. No-op when
    // nothing declares a job type. Same import-time fault isolation as the
    // scheduler above, and for the same reason — see that block's comment.
    let stopJobWorker: () => void = () => {};
    try {
      const jobs = await import('./src/jobs');
      stopJobWorker = jobs.stopJobWorker;
      jobs.startJobWorker();
    } catch (err) {
      logger.error('Failed to start plugin job worker — no jobs will run this process', { err });
    }

    // Backup job worker (RFC 0084, epic task 8.16) — claims and runs queued
    // backup_jobs rows, and sweeps expired archives. Off by default (opt-in
    // via SOVEREIGN_BACKUP_WORKER_ENABLED, see backup-worker.ts's doc
    // comment) — there's no enqueue path yet, so ticking would just be a
    // wasted DB query on every instance.
    const { startBackupWorker, stopBackupWorker } = await import('./src/backup-worker');
    startBackupWorker();

    // Operator-configured log retention (GDPR-7) — prunes delivery/access
    // and (separately) activity logs once an admin sets a window in Console;
    // always started, unlike the backup worker above, since its settings are
    // reachable immediately and its 6h tick is negligible overhead even when
    // both settings are unset. See retention-worker.ts's doc comment.
    const { startRetentionWorker, stopRetentionWorker } = await import('./src/retention-worker');
    startRetentionWorker();

    // Realtime event broker (RFC 0045) — independent of the notification
    // broker above (separate env var, separate keyspace); see
    // event-broker.ts's doc comment for why. Unlike the notification broker,
    // an event broker is always instantiated (including 'polling' mode) —
    // its ring buffer is what `/api/events/poll` reads, since events have no
    // durable store to poll against instead.
    const eventsTransport = process.env.SOVEREIGN_EVENTS_TRANSPORT ?? 'sse';
    const { initEventBroker, closeEventBroker } = await import('./src/event-broker');
    if (eventsTransport === 'redis') {
      if (!redisUrl) {
        logger.error(
          'SOVEREIGN_EVENTS_TRANSPORT=redis requires REDIS_URL — falling back to in-process',
        );
        await initEventBroker('sse');
      } else {
        await initEventBroker('redis', redisUrl);
        logger.info('Event broker: Redis Pub/Sub', { transport: 'redis' });
      }
    } else {
      // Any non-'redis' value (default 'sse', or 'polling') instantiates the
      // same in-process broker — see initEventBroker()'s doc comment for why
      // an event broker exists even in 'polling' mode. The distinction only
      // matters to `/api/events/stream`, which reads this env var directly
      // to decide whether to accept SSE connections at all.
      await initEventBroker(eventsTransport);
      logger.info(`Event broker: in-process (${eventsTransport})`, { transport: eventsTransport });
    }

    process.on('SIGTERM', () => {
      stopScheduler();
      stopJobWorker();
      stopBackupWorker();
      stopRetentionWorker();
      void closeBroker();
      void closeEventBroker();
    });
  }
}
