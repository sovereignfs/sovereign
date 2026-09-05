'use client';

import { useEffect, useRef, useState } from 'react';
import { Button, EmptyState } from '@sovereignfs/ui';
import { getInstanceBackupJobStatusAction } from './actions';
import styles from '../console.module.css';

export interface BackupJobView {
  id: string;
  status: 'queued' | 'running' | 'complete' | 'failed';
  sizeBytes: number;
  errorMessage: string | null;
  downloadUrl: string | null;
  pushStatus: 'succeeded' | 'failed' | null;
  pushError: string | null;
  createdAt: number;
}

const POLL_INTERVAL_MS = 3000;

function isInFlight(status: BackupJobView['status']): boolean {
  return status === 'queued' || status === 'running';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Mirrors `plugins/account/app/_components/PortabilityPanel.tsx`'s own
 * enqueue/poll/download shape (epic task 8.18) — a plain `setInterval`
 * driving repeated status-action calls, stopped once nothing is left
 * in-flight. Polls every in-flight job in the list together on one shared
 * timer, rather than one timer per job, since Console's list can hold
 * several concurrently (unlike Account's single-job panel).
 *
 * `initialJobs` resyncs local state on every prop change, not just on first
 * mount — `BackupTriggerForm`'s `router.refresh()` after a successful
 * enqueue re-runs this page's Server Component and hands down a fresh
 * `initialJobs` array (new reference) including the just-created job, which
 * this effect picks up. Without it, a `useState` initializer alone would
 * freeze the list at whatever it was on first render, the same class of
 * stale-initial-state bug this codebase has hit before with `defaultValue`-
 * seeded fields across a selection change.
 */
export function BackupJobList({ initialJobs }: { initialJobs: BackupJobView[] }) {
  const [jobs, setJobs] = useState<BackupJobView[]>(initialJobs);
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => setJobs(initialJobs), [initialJobs]);

  function stopPolling(): void {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  useEffect(() => stopPolling, []);

  const hasInFlight = jobs.some((j) => isInFlight(j.status));
  useEffect(() => {
    if (!hasInFlight) {
      stopPolling();
      return;
    }
    if (pollRef.current) return; // already running — it reads jobsRef fresh on every tick, no restart needed

    pollRef.current = setInterval(() => {
      // Read fresh on every tick (not a closed-over snapshot from when the
      // interval was created) so a job added after polling started — e.g. a
      // second trigger while the first is still running — gets included.
      const inFlightIds = jobsRef.current.filter((j) => isInFlight(j.status)).map((j) => j.id);
      if (inFlightIds.length === 0) {
        stopPolling();
        return;
      }
      void (async () => {
        const results = await Promise.all(
          inFlightIds.map(async (id) => {
            try {
              return await getInstanceBackupJobStatusAction(id);
            } catch {
              return null; // transient failure — the next tick tries again
            }
          }),
        );
        setJobs((prev) =>
          prev.map((job) => {
            const updated = results.find((r) => r?.jobId === job.id);
            return updated ? { ...job, ...updated } : job;
          }),
        );
      })();
    }, POLL_INTERVAL_MS);
    // Deliberately keyed on hasInFlight alone — the tick above reads
    // jobsRef fresh on every fire, never a stale closure over this render's
    // jobs array, so no other dependency is needed here.
  }, [hasInFlight]);

  if (jobs.length === 0) {
    return <EmptyState heading="No backups yet" description="Trigger one above to see it here." />;
  }

  return (
    <ul className={styles.list}>
      {jobs.map((job) => (
        <li key={job.id} className={styles.card}>
          <div>
            <strong>{new Date(job.createdAt * 1000).toLocaleString()}</strong>
            <p className={styles.helpText}>
              {job.status}
              {job.status === 'complete' && ` · ${formatBytes(job.sizeBytes)}`}
              {job.status === 'failed' && job.errorMessage ? ` · ${job.errorMessage}` : ''}
              {job.pushStatus === 'succeeded' && ' · pushed to Git'}
              {job.pushStatus === 'failed' && job.pushError
                ? ` · Git push failed: ${job.pushError}`
                : ''}
            </p>
          </div>
          {job.downloadUrl && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => window.location.assign(job.downloadUrl as string)}
            >
              Download
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}
