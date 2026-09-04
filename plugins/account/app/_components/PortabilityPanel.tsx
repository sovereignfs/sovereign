'use client';

import { type FormEvent, useEffect, useRef, useState } from 'react';
import { strFromU8, unzipSync } from 'fflate';
import { Alert, Button, Checkbox, FileDropzone, FormField, Input, Select } from '@sovereignfs/ui';
import styles from '../account.module.css';

interface ImportSummary {
  formatVersion: number;
  sourceInstance: string | null;
  sections: { pluginId: string; status: 'imported' | 'skipped'; warning?: string }[];
}

interface NotExportedEntry {
  pluginId: string;
  reason: 'no-export-hook' | 'disabled' | 'user-excluded';
}

interface BackupJobStatus {
  jobId: string;
  status: 'queued' | 'running' | 'complete' | 'failed';
  sizeBytes: number;
  errorMessage: string | null;
  downloadUrl: string | null;
  pushStatus: 'succeeded' | 'failed' | null;
  pushError: string | null;
}

interface BackupDestinationOption {
  id: string;
  label: string;
}

const POLL_INTERVAL_MS = 3000;
const MIN_PASSPHRASE_LENGTH = 8;

/** Read `manifest.json`'s `notExported` list straight out of the downloaded ZIP — no second request needed. */
function readNotExported(zipBytes: Uint8Array): NotExportedEntry[] {
  try {
    const files = unzipSync(zipBytes);
    const manifestBytes = files['manifest.json'];
    if (!manifestBytes) return [];
    const manifest = JSON.parse(strFromU8(manifestBytes)) as { notExported?: NotExportedEntry[] };
    return manifest.notExported ?? [];
  } catch {
    return [];
  }
}

/**
 * Account → Data: self-service export (download a versioned ZIP), an async
 * selective full backup (RFC 0084, epic task 8.18), and import/restore
 * (upload a bundle, with a per-section result summary). RFC 0007.
 */
export function PortabilityPanel() {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [notExported, setNotExported] = useState<NotExportedEntry[] | null>(null);
  const [pluginNames, setPluginNames] = useState<Record<string, string>>({});
  const [includeFiles, setIncludeFiles] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  // Full backup (async, selective, passphrase-encrypted).
  const [backupIncludeFiles, setBackupIncludeFiles] = useState(true);
  const [excludedPluginIds, setExcludedPluginIds] = useState<Set<string>>(new Set());
  const [backupPassphrase, setBackupPassphrase] = useState('');
  const [backupStarting, setBackupStarting] = useState(false);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [backupJob, setBackupJob] = useState<BackupJobStatus | null>(null);
  const [destinations, setDestinations] = useState<BackupDestinationOption[]>([]);
  const [pushDestinationId, setPushDestinationId] = useState('');
  const [pushDestinationLabel, setPushDestinationLabel] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function loadPluginNames() {
    try {
      const res = await fetch('/api/plugins');
      if (!res.ok) return;
      const data = (await res.json()) as { plugins?: { id: string; name: string }[] };
      const names: Record<string, string> = {};
      for (const p of data.plugins ?? []) names[p.id] = p.name;
      setPluginNames(names);
    } catch {
      // Best-effort — falls back to raw plugin ids below.
    }
  }

  /**
   * `/api/account/connections` returns every connection regardless of
   * provider (Warden's model providers included) — filtered client-side to
   * `git.custom` (workstream 0023's backup-destination provider kind) and
   * `connected` status, since a disconnected/errored destination can't
   * receive a push.
   */
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
      // Best-effort — the push option is simply unavailable this load.
    }
  }

  useEffect(() => {
    void loadPluginNames();
    void loadDestinations();
  }, []);

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  // Stop the poll interval on unmount, regardless of job state at that point.
  useEffect(() => stopPolling, []);

  async function pollBackupJob(jobId: string) {
    try {
      const res = await fetch(`/api/account/backup-jobs/${jobId}`);
      if (!res.ok) return;
      const data = (await res.json()) as BackupJobStatus;
      setBackupJob(data);
      if (data.status === 'complete' || data.status === 'failed') stopPolling();
    } catch {
      // Transient failure — the next tick tries again.
    }
  }

  async function onStartBackup() {
    setBackupError(null);
    if (backupPassphrase.length < MIN_PASSPHRASE_LENGTH) {
      setBackupError(`Passphrase must be at least ${String(MIN_PASSPHRASE_LENGTH)} characters.`);
      return;
    }
    setBackupStarting(true);
    stopPolling();
    setBackupJob(null);
    try {
      const res = await fetch('/api/account/backup-jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          passphrase: backupPassphrase,
          includeFiles: backupIncludeFiles,
          excludePluginIds: Array.from(excludedPluginIds),
          pushDestinationId: pushDestinationId || undefined,
        }),
      });
      const data = (await res.json()) as { jobId?: string; error?: string };
      const jobId = data.jobId;
      if (!res.ok || !jobId) {
        throw new Error(data.error ?? `Could not start backup (${res.status})`);
      }
      // The passphrase is never sent again and never stored client-side beyond this point.
      setBackupPassphrase('');
      setPushDestinationLabel(destinations.find((d) => d.id === pushDestinationId)?.label ?? null);
      setBackupJob({
        jobId,
        status: 'queued',
        sizeBytes: 0,
        errorMessage: null,
        downloadUrl: null,
        pushStatus: null,
        pushError: null,
      });
      pollRef.current = setInterval(() => void pollBackupJob(jobId), POLL_INTERVAL_MS);
    } catch (e) {
      setBackupError(e instanceof Error ? e.message : 'Could not start backup');
    } finally {
      setBackupStarting(false);
    }
  }

  function toggleExcluded(pluginId: string, excluded: boolean) {
    setExcludedPluginIds((prev) => {
      const next = new Set(prev);
      if (excluded) next.add(pluginId);
      else next.delete(pluginId);
      return next;
    });
  }

  const backupPending =
    backupStarting || backupJob?.status === 'queued' || backupJob?.status === 'running';
  const backupDownloadUrl = backupJob?.status === 'complete' ? backupJob.downloadUrl : null;

  async function onExport() {
    setExporting(true);
    setExportError(null);
    setNotExported(null);
    try {
      const res = await fetch(`/api/account/export?includeFiles=${String(includeFiles)}`);
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const skipped = readNotExported(bytes);
      setNotExported(skipped);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sovereign-export-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  }

  async function onImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    setImporting(true);
    setImportError(null);
    setSummary(null);
    try {
      const form = new FormData();
      form.append('bundle', file);
      const res = await fetch('/api/account/import', { method: 'POST', body: form });
      const data = (await res.json()) as ImportSummary | { error?: string };
      if (!res.ok) {
        const message =
          'error' in data && data.error ? data.error : `Import failed (${res.status})`;
        throw new Error(message);
      }
      setSummary(data as ImportSummary);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  }

  return (
    <>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Export my data</h2>
        <p className={styles.help}>
          Download a copy of your account data — profile, preferences, avatar, and any participating
          apps — as a ZIP archive you can keep or import elsewhere.
        </p>
        <div style={{ marginBottom: 'var(--sv-space-3)' }}>
          <Checkbox
            checked={includeFiles}
            onChange={setIncludeFiles}
            label="Include files and attachments from participating apps"
            disabled={exporting}
          />
        </div>
        <div style={{ alignSelf: 'flex-start' }}>
          <Button type="button" onClick={() => void onExport()} disabled={exporting}>
            {!exporting && (
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 6 }}
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            )}
            {exporting ? 'Preparing…' : 'Export as ZIP'}
          </Button>
        </div>
        {exportError && <p className={styles.error}>{exportError}</p>}
        {notExported && notExported.length > 0 && (
          <p className={styles.notice}>
            {notExported.length} installed app{notExported.length === 1 ? '' : 's'} didn&apos;t
            export data: {notExported.map((n) => pluginNames[n.pluginId] ?? n.pluginId).join(', ')}
            {notExported.some((n) => n.reason === 'disabled')
              ? ' (some are disabled).'
              : " (these apps don't support data export yet)."}
          </p>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Full backup</h2>
          <p className={styles.sectionSubtitle}>
            A larger, encrypted backup generated in the background — come back later for the
            download link. Choose which apps to include and set a passphrase to decrypt it.
          </p>
        </div>

        {Object.keys(pluginNames).length > 0 && (
          <div style={{ marginBottom: 'var(--sv-space-3)' }}>
            <p className={styles.help} style={{ marginBottom: 'var(--sv-space-2)' }}>
              Include:
            </p>
            {Object.entries(pluginNames).map(([id, name]) => (
              <div key={id} style={{ marginBottom: 'var(--sv-space-1)' }}>
                <Checkbox
                  checked={!excludedPluginIds.has(id)}
                  onChange={(checked) => toggleExcluded(id, !checked)}
                  label={name}
                  disabled={backupPending}
                />
              </div>
            ))}
          </div>
        )}
        <div style={{ marginBottom: 'var(--sv-space-3)' }}>
          <Checkbox
            checked={backupIncludeFiles}
            onChange={setBackupIncludeFiles}
            label="Include files and attachments from participating apps"
            disabled={backupPending}
          />
        </div>

        <FormField
          label="Passphrase"
          id="full-backup-passphrase"
          hint="Needed to decrypt the archive later — Sovereign does not store it"
        >
          {(field) => (
            <Input
              {...field}
              type="password"
              autoComplete="off"
              value={backupPassphrase}
              onChange={(e) => setBackupPassphrase(e.target.value)}
              disabled={backupPending}
            />
          )}
        </FormField>

        {destinations.length > 0 && (
          <FormField
            label="Push to a connected destination"
            id="full-backup-push-destination"
            hint="Optional — pushes an age-encrypted copy to your own git repo once the backup is ready"
          >
            {(field) => (
              <Select
                {...field}
                value={pushDestinationId}
                onChange={(e) => setPushDestinationId(e.target.value)}
                disabled={backupPending}
              >
                <option value="">Don&apos;t push</option>
                {destinations.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
        )}

        {backupError && (
          <p className={styles.feedbackError} role="status" aria-live="polite">
            {backupError}
          </p>
        )}

        <div style={{ alignSelf: 'flex-start', marginTop: 'var(--sv-space-3)' }}>
          <Button type="button" onClick={() => void onStartBackup()} disabled={backupPending}>
            {backupPending ? 'Backing up…' : 'Start full backup'}
          </Button>
        </div>

        {backupJob && (
          <div style={{ marginTop: 'var(--sv-space-3)' }}>
            {(backupJob.status === 'queued' || backupJob.status === 'running') && (
              <p className={styles.help}>
                {backupJob.status === 'queued' ? 'Queued…' : 'Preparing your backup…'} You can leave
                this page — it&apos;ll keep running.
              </p>
            )}
            {backupJob.status === 'failed' && (
              <Alert variant="error" heading="Backup failed">
                {backupJob.errorMessage ?? 'Something went wrong. Try again.'}
              </Alert>
            )}
            {backupDownloadUrl && (
              <Alert variant="success" heading="Backup ready">
                <p className={styles.help}>
                  {(backupJob.sizeBytes / (1024 * 1024)).toFixed(1)} MB, encrypted with the
                  passphrase you set.
                </p>
                <div style={{ marginTop: 'var(--sv-space-2)' }}>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => window.location.assign(backupDownloadUrl)}
                  >
                    Download
                  </Button>
                </div>
              </Alert>
            )}
            {backupJob.status === 'complete' && backupJob.pushStatus === 'succeeded' && (
              <p className={styles.help} style={{ marginTop: 'var(--sv-space-2)' }}>
                Also pushed to {pushDestinationLabel ?? 'your connected destination'}.
              </p>
            )}
            {backupJob.status === 'complete' && backupJob.pushStatus === 'failed' && (
              <Alert
                variant="warning"
                heading={`Couldn't push to ${pushDestinationLabel ?? 'your connected destination'}`}
              >
                {backupJob.pushError ?? 'Something went wrong pushing the backup. Try again.'} The
                backup itself is still ready to download above.
              </Alert>
            )}
          </div>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Import / restore</h2>
          <p className={styles.sectionSubtitle}>
            Restore from a Sovereign export ZIP. App data is merged in as new records. Your profile
            name, avatar, and preferences are replaced with the values from the ZIP. Apps that
            aren&apos;t installed are skipped.
          </p>
        </div>
        <form className={styles.form} onSubmit={(e) => void onImport(e)}>
          <FileDropzone
            ariaLabel="Upload ZIP file"
            accept=".zip,application/zip"
            label={file ? file.name : 'Choose a ZIP file'}
            hint={file ? `${(file.size / 1024).toFixed(0)} KB` : 'or drag and drop here'}
            onFileSelect={setFile}
          />
          <div style={{ alignSelf: 'flex-start' }}>
            <button type="submit" className={styles.addPasskeyBtn} disabled={!file || importing}>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              {importing ? 'Importing…' : 'Import'}
            </button>
          </div>
        </form>
        {importError && <p className={styles.error}>{importError}</p>}
        {summary && (
          <div>
            <p className={styles.success}>Import complete.</p>
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
                  {s.warning ? (
                    <div
                      style={{
                        fontSize: 'var(--sv-font-size-sm)',
                        color: 'var(--sv-color-text-muted)',
                      }}
                    >
                      {s.warning}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </>
  );
}
