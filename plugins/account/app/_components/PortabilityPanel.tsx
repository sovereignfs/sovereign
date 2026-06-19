'use client';

import { type FormEvent, useState } from 'react';
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
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  async function onExport() {
    setExporting(true);
    setExportError(null);
    try {
      const res = await fetch('/api/account/export');
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
        <button
          type="button"
          className={styles.button}
          onClick={() => void onExport()}
          disabled={exporting}
        >
          {exporting ? 'Preparing…' : 'Export my data'}
        </button>
        {exportError && <p className={styles.error}>{exportError}</p>}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Import / restore</h2>
        <p className={styles.help}>
          Restore from a Sovereign export ZIP. Imported data is added to your account — nothing is
          overwritten or deleted. Plugins that aren&rsquo;t installed are skipped.
        </p>
        <form className={styles.form} onSubmit={(e) => void onImport(e)}>
          <input
            className={styles.input}
            type="file"
            accept=".zip,application/zip"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <button type="submit" className={styles.button} disabled={!file || importing}>
            {importing ? 'Importing…' : 'Import'}
          </button>
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
                  <span style={{ color: 'var(--sv-color-text-secondary)' }}>{s.status}</span>
                  {s.warning ? (
                    <div
                      style={{
                        fontSize: 'var(--sv-font-size-sm)',
                        color: 'var(--sv-color-text-secondary)',
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
