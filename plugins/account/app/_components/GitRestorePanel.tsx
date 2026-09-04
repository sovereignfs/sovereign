'use client';

import { useEffect, useState } from 'react';
import { Decrypter } from 'age-encryption';
import { Alert, Button, FileDropzone, FormField, Select } from '@sovereignfs/ui';
import styles from '../account.module.css';

interface BackupDestinationOption {
  id: string;
  label: string;
}

interface BackupTag {
  tag: string;
  timestamp: string;
  platformVersion: string;
}

interface RestoreJobStatus {
  jobId: string;
  status: 'queued' | 'running' | 'complete' | 'failed';
  sizeBytes: number;
  errorMessage: string | null;
  downloadUrl: string | null;
}

interface ImportSummary {
  formatVersion: number;
  sourceInstance: string | null;
  sections: { pluginId: string; status: 'imported' | 'skipped'; warning?: string }[];
}

/** Restore over the wire genuinely fails past this before the network transfer alone becomes untenable. */
const MAX_IMPORT_MB = 50;
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Account → Data: restore from a connected git backup destination
 * (workstream 0023 leg 4, epic 8.40). Lists the destination's tagged
 * backups, fetches the chosen one's ciphertext via the same async job/
 * signed-download infrastructure as a real backup, decrypts it entirely
 * client-side with a backup key the user supplies for this one operation
 * (never stored, never sent anywhere), and hands the decrypted bytes to the
 * existing, unmodified `POST /api/account/import`.
 */
export function GitRestorePanel() {
  const [destinations, setDestinations] = useState<BackupDestinationOption[]>([]);
  const [destinationId, setDestinationId] = useState('');
  const [tags, setTags] = useState<BackupTag[]>([]);
  const [tagsLoading, setTagsLoading] = useState(false);
  const [tagsError, setTagsError] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState('');
  const [identityFile, setIdentityFile] = useState<File | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreStep, setRestoreStep] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  async function loadDestinations() {
    try {
      const res = await fetch('/api/account/connections');
      if (!res.ok) return;
      const data = (await res.json()) as {
        connections?: { id: string; provider: string; label: string; status: string }[];
      };
      setDestinations(
        (data.connections ?? [])
          .filter((c) => c.provider === 'git.custom' && c.status === 'connected')
          .map((c) => ({ id: c.id, label: c.label })),
      );
    } catch {
      // Best-effort — the restore option is simply unavailable this load.
    }
  }

  useEffect(() => {
    void loadDestinations();
  }, []);

  async function onSelectDestination(id: string) {
    setDestinationId(id);
    setSelectedTag('');
    setTags([]);
    setTagsError(null);
    setSummary(null);
    setRestoreError(null);
    if (!id) return;
    setTagsLoading(true);
    try {
      const res = await fetch(`/api/account/restore-jobs/tags?destinationId=${id}`);
      const data = (await res.json()) as { tags?: BackupTag[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? `Could not list backups (${res.status})`);
      setTags(data.tags ?? []);
    } catch (e) {
      setTagsError(e instanceof Error ? e.message : 'Could not list backups.');
    } finally {
      setTagsLoading(false);
    }
  }

  async function pollRestoreJob(jobId: string): Promise<RestoreJobStatus> {
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    for (;;) {
      const res = await fetch(`/api/account/restore-jobs/${jobId}`);
      if (!res.ok) throw new Error(`Could not check restore status (${res.status})`);
      const data = (await res.json()) as RestoreJobStatus;
      if (data.status === 'complete' || data.status === 'failed') return data;
      if (Date.now() > deadline) throw new Error('Restore is taking too long — try again later.');
      await sleep(POLL_INTERVAL_MS);
    }
  }

  async function onRestore() {
    if (!destinationId || !selectedTag || !identityFile) return;
    setRestoring(true);
    setRestoreError(null);
    setSummary(null);
    // Read once, right here — never assigned to any React state, so it
    // exists only in this function's own scope for the duration of this one
    // restore attempt. A second restore re-prompts for the file rather than
    // remembering it (workstream 0023's "never React state, never
    // sessionStorage" invariant for the identity).
    const identity = await identityFile.text();
    try {
      setRestoreStep('Fetching from your git destination…');
      const enqueueRes = await fetch('/api/account/restore-jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destinationId, tag: selectedTag }),
      });
      const enqueueData = (await enqueueRes.json()) as { jobId?: string; error?: string };
      if (!enqueueRes.ok || !enqueueData.jobId) {
        throw new Error(enqueueData.error ?? `Could not start restore (${enqueueRes.status})`);
      }

      const job = await pollRestoreJob(enqueueData.jobId);
      if (job.status === 'failed' || !job.downloadUrl) {
        throw new Error(job.errorMessage ?? 'Could not fetch the backup from git.');
      }

      setRestoreStep('Decrypting…');
      const downloadRes = await fetch(job.downloadUrl);
      if (!downloadRes.ok || !downloadRes.body) {
        throw new Error(`Could not download the fetched backup (${downloadRes.status})`);
      }
      const decrypter = new Decrypter();
      decrypter.addIdentity(identity);
      let plaintext: Blob;
      try {
        // Streaming decrypt (age-encryption's ChaCha20-Poly1305 STREAM
        // construction) — the browser processes ciphertext as it arrives
        // over the network rather than buffering the whole download first.
        const decryptedStream = await decrypter.decrypt(downloadRes.body);
        plaintext = await new Response(decryptedStream).blob();
      } catch {
        throw new Error('Decryption failed — check that this is the right backup key.');
      }

      setRestoreStep('Importing…');
      const form = new FormData();
      form.append('bundle', new File([plaintext], 'sovereign-restore.zip'));
      const importRes = await fetch('/api/account/import', { method: 'POST', body: form });
      const importData = (await importRes.json()) as ImportSummary | { error?: string };
      if (!importRes.ok) {
        const message =
          'error' in importData && importData.error
            ? importData.error
            : `Import failed (${importRes.status})`;
        throw new Error(message);
      }
      setSummary(importData as ImportSummary);
    } catch (e) {
      setRestoreError(e instanceof Error ? e.message : 'Restore failed.');
    } finally {
      setRestoring(false);
      setRestoreStep(null);
      setIdentityFile(null); // re-prompt for the key on the next attempt
    }
  }

  if (destinations.length === 0) return null;

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Restore from a git destination</h2>
        <p className={styles.sectionSubtitle}>
          Pull a backup down from a connected git repository and decrypt it in your browser with
          your backup key — Sovereign never sees the decrypted data or the key. Backups over{' '}
          {MAX_IMPORT_MB}MB can&apos;t be restored in-app yet; clone the repository and decrypt the
          tag directly with any <code>age</code> client instead.
        </p>
      </div>

      <FormField label="Destination" id="restore-destination">
        {(field) => (
          <Select
            {...field}
            value={destinationId}
            onChange={(e) => void onSelectDestination(e.target.value)}
            disabled={restoring}
          >
            <option value="">Choose a destination…</option>
            {destinations.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </Select>
        )}
      </FormField>

      {tagsLoading && <p className={styles.help}>Loading backups&hellip;</p>}
      {tagsError && <p className={styles.error}>{tagsError}</p>}
      {!tagsLoading && destinationId && tags.length === 0 && !tagsError && (
        <p className={styles.help}>No backups found on this destination yet.</p>
      )}

      {tags.length > 0 && (
        <FormField label="Backup" id="restore-tag">
          {(field) => (
            <Select
              {...field}
              value={selectedTag}
              onChange={(e) => setSelectedTag(e.target.value)}
              disabled={restoring}
            >
              <option value="">Choose a backup…</option>
              {tags.map((t) => (
                <option key={t.tag} value={t.tag}>
                  {new Date(t.timestamp).toLocaleString()}
                </option>
              ))}
            </Select>
          )}
        </FormField>
      )}

      {selectedTag && (
        <FileDropzone
          ariaLabel="Upload your backup key"
          accept=".txt,text/plain"
          label={identityFile ? identityFile.name : 'Choose your backup key'}
          hint={
            identityFile ? undefined : 'The file you downloaded when connecting this destination'
          }
          onFileSelect={setIdentityFile}
        />
      )}

      {restoreError && (
        <p className={styles.feedbackError} role="status" aria-live="polite">
          {restoreError}
        </p>
      )}

      {selectedTag && identityFile && (
        <div style={{ alignSelf: 'flex-start', marginTop: 'var(--sv-space-3)' }}>
          <Button type="button" onClick={() => void onRestore()} disabled={restoring}>
            {restoring ? (restoreStep ?? 'Restoring…') : 'Restore this backup'}
          </Button>
        </div>
      )}

      {summary && (
        <Alert variant="success" heading="Restore complete">
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {summary.sections.map((s) => (
              <li
                key={s.pluginId}
                style={{
                  padding: 'var(--sv-space-2) 0',
                  borderBottom: '1px solid var(--sv-color-border)',
                }}
              >
                <strong>{s.pluginId}</strong>{' '}
                <span style={{ color: 'var(--sv-color-text-muted)' }}>{s.status}</span>
              </li>
            ))}
          </ul>
        </Alert>
      )}
    </section>
  );
}
