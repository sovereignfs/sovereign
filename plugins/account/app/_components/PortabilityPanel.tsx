'use client';

import { type DragEvent, type FormEvent, useState } from 'react';
import { Button, Checkbox } from '@sovereignfs/ui';
import styles from '../account.module.css';

interface ImportSummary {
  formatVersion: number;
  sourceInstance: string | null;
  sections: { pluginId: string; status: 'imported' | 'skipped'; warning?: string }[];
}

/**
 * Account → Data: self-service export (download a versioned ZIP) and
 * import/restore (upload a bundle, with a per-section result summary). RFC 0007.
 */
export function PortabilityPanel() {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [includeFiles, setIncludeFiles] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  async function onExport() {
    setExporting(true);
    setExportError(null);
    try {
      const res = await fetch(`/api/account/export?includeFiles=${String(includeFiles)}`);
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
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
          <label
            aria-label="Upload ZIP file"
            className={`${styles.dropzone} ${dragging ? styles.dropzoneActive : ''}`}
            onDragOver={(e: DragEvent) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e: DragEvent) => {
              e.preventDefault();
              setDragging(false);
              const dropped = e.dataTransfer.files[0];
              if (dropped) setFile(dropped);
            }}
          >
            <svg
              width="36"
              height="36"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              style={{ color: 'var(--sv-color-text-muted)', flexShrink: 0 }}
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <text x="6" y="19" fontSize="5" fontWeight="700" fill="currentColor" stroke="none">
                ZIP
              </text>
            </svg>
            <div className={styles.dropzoneText}>
              <span className={styles.dropzoneTitle}>{file ? file.name : 'Choose a ZIP file'}</span>
              <span className={styles.dropzoneHint}>
                {file ? `${(file.size / 1024).toFixed(0)} KB` : 'or drag and drop here'}
              </span>
            </div>
            <input
              type="file"
              accept=".zip,application/zip"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className={styles.hiddenInput}
            />
          </label>
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
