'use client';

import { type FormEvent, useState } from 'react';
import { strFromU8, unzipSync } from 'fflate';
import { Button, Checkbox, FileDropzone } from '@sovereignfs/ui';
import styles from '../account.module.css';

interface ImportSummary {
  formatVersion: number;
  sourceInstance: string | null;
  sections: { pluginId: string; status: 'imported' | 'skipped'; warning?: string }[];
}

interface NotExportedEntry {
  pluginId: string;
  reason: 'no-export-hook' | 'disabled';
}

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
 * Account → Data: self-service export (download a versioned ZIP) and
 * import/restore (upload a bundle, with a per-section result summary). RFC 0007.
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
      if (skipped.length > 0) void loadPluginNames();
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
          plugins — as a ZIP archive you can keep or import elsewhere.
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
          <h2 className={styles.sectionTitle}>Import / restore</h2>
          <p className={styles.sectionSubtitle}>
            Restore from a Sovereign export ZIP. Data is merged — nothing is overwritten. Plugins
            not installed are skipped.
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
