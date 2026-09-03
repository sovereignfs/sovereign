/**
 * Transient, in-memory holder for a backup job's requester-supplied
 * passphrase (RFC 0084, epic task 8.18) — the bridge between "enqueue" (a
 * real request, has the passphrase) and "run" (a later worker tick, has only
 * the `backup_jobs` row). The passphrase must never be persisted (RFC 0084:
 * "always applied — no opt-out... never persisted"), so this deliberately
 * lives in process memory only, single-use, and is never written to the
 * `backup_jobs` row or any log line.
 *
 * Viable specifically because the runtime is one persistent Node process
 * (PM2/Docker, not serverless) — the same assumption the worker itself
 * already depends on. If the process restarts between enqueue and claim, the
 * entry is gone and the job fails cleanly with a clear error (matches the
 * worker's own "a running job orphaned by a restart is swept back to failed"
 * philosophy) rather than silently using no passphrase.
 *
 * State is anchored on `globalThis`, not a plain module-scope `const` —
 * confirmed live (dev server, two `[DIAG]`-tagged module-instance ids logged
 * in the same running process) that the enqueue route (an on-demand-compiled
 * Route Handler) and the worker tick (dynamically imported once, at boot, by
 * `instrumentation.ts`) land in separate webpack module registries under
 * `next dev`, so a plain top-level `Map` is NOT actually shared between them
 * — every enqueued passphrase was invisible to the worker, failing every job
 * with "No passphrase available for this job". Same class of gotcha Next.js's
 * own docs warn about for a dev-mode Prisma client singleton; `globalThis` is
 * the standard fix, safe in production too (there, everything resolves to
 * the same compiled module, so this is a no-op there, not a behavior change).
 */

const ENTRY_TTL_MS = 10 * 60_000; // a queued job not claimed within 10 minutes is abandoned
const EVICTION_INTERVAL_MS = 5 * 60_000;

interface Entry {
  passphrase: string;
  expiresAt: number;
}

interface StoreState {
  entries: Map<string, Entry>;
  lastSweepAt: number;
}

const globalForBackupPassphrase = globalThis as unknown as {
  __sovereignBackupPassphraseStore?: StoreState;
};

const state: StoreState = (globalForBackupPassphrase.__sovereignBackupPassphraseStore ??= {
  entries: new Map<string, Entry>(),
  lastSweepAt: 0,
});

function sweepExpired(now: number): void {
  if (now - state.lastSweepAt < EVICTION_INTERVAL_MS) return;
  state.lastSweepAt = now;
  for (const [jobId, entry] of state.entries) {
    if (entry.expiresAt <= now) state.entries.delete(jobId);
  }
}

/** Store a job's passphrase right after enqueueing it. */
export function storeBackupPassphrase(jobId: string, passphrase: string, now = Date.now()): void {
  sweepExpired(now);
  state.entries.set(jobId, { passphrase, expiresAt: now + ENTRY_TTL_MS });
}

/**
 * Retrieve and immediately discard a job's passphrase — single-use, called
 * once by whichever tick claims and runs the job. Returns `undefined` if the
 * entry never existed, already expired, or was already taken.
 */
export function takeBackupPassphrase(jobId: string, now = Date.now()): string | undefined {
  sweepExpired(now);
  const entry = state.entries.get(jobId);
  state.entries.delete(jobId);
  if (!entry || entry.expiresAt <= now) return undefined;
  return entry.passphrase;
}

export function resetBackupPassphraseStoreForTests(): void {
  state.entries.clear();
  state.lastSweepAt = 0;
}

/** Test-only: the number of live entries. */
export function backupPassphraseStoreCountForTests(): number {
  return state.entries.size;
}
