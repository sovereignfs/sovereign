'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Button, QuantityStepper, Select } from '@sovereignfs/ui';
import { deleteInactiveSessionsAction, setDefaultModelAction } from '../actions';
import type { DiscoveredModel } from '../_lib/model-discovery';
import styles from './settings.module.css';

const DEFAULT_RETENTION_DAYS = 30;

/**
 * Warden's Settings → General tab (RFC 0063 §11, epic task 22.9). Resolves
 * three open questions RFC 0063 deliberately left for implementation:
 *
 * - **Default model** — a new per-user setting (`_lib/user-settings.ts`),
 *   used for a brand-new session; existing sessions are unaffected.
 * - **Retention** — a manual, on-demand "delete sessions inactive for over
 *   N days" action, never a scheduled job (Warden declares no
 *   `sdk.schedules` capability today). Pinned sessions are never deleted,
 *   regardless of how long they've been inactive.
 * - **Export** — a deep link to the existing account-wide data export
 *   (`/account/data`), not a new Warden-only download mechanism.
 */
export function GeneralSettings({
  visibleModels,
  defaultModelKey,
}: {
  visibleModels: DiscoveredModel[];
  defaultModelKey: string | null;
}) {
  const [selectedModel, setSelectedModel] = useState(defaultModelKey ?? '');
  const [, startModelTransition] = useTransition();
  const [retentionDays, setRetentionDays] = useState(DEFAULT_RETENTION_DAYS);
  const [retentionPending, startRetentionTransition] = useTransition();
  const [retentionMessage, setRetentionMessage] = useState<string | null>(null);

  function handleDefaultModelChange(value: string) {
    setSelectedModel(value);
    startModelTransition(async () => {
      await setDefaultModelAction(value || null);
    });
  }

  function handleDeleteInactive() {
    setRetentionMessage(null);
    startRetentionTransition(async () => {
      const result = await deleteInactiveSessionsAction(retentionDays);
      setRetentionMessage(result.ok ? result.message : result.error);
    });
  }

  return (
    <div className={styles.tabPanel}>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Default model</h2>
        <p className={styles.helpText}>
          Used to preselect a model whenever you start a new session. Existing sessions keep
          whatever model they were already using.
        </p>
        <Select
          value={selectedModel}
          onChange={(event) => handleDefaultModelChange(event.target.value)}
          aria-label="Default model for new sessions"
          disabled={visibleModels.length === 0}
        >
          <option value="">No default — use the first available model</option>
          {visibleModels.map((model) => (
            <option key={model.key} value={model.key}>
              {model.label}
            </option>
          ))}
        </Select>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Retention</h2>
        <p className={styles.helpText}>
          Delete sessions that haven&rsquo;t been active in a while. Pinned sessions are never
          affected, no matter how old.
        </p>
        <div className={styles.retentionRow}>
          <QuantityStepper
            value={retentionDays}
            onChange={setRetentionDays}
            min={1}
            max={365}
            unit="days"
            aria-label="Inactivity threshold in days"
            disabled={retentionPending}
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={handleDeleteInactive}
            disabled={retentionPending}
          >
            {retentionPending ? 'Deleting…' : 'Delete inactive sessions'}
          </Button>
        </div>
        {retentionMessage && <p className={styles.feedbackText}>{retentionMessage}</p>}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Export</h2>
        <p className={styles.helpText}>
          Your Warden chat history is included in your account-wide data export, alongside every
          other app&rsquo;s data.
        </p>
        <Link href="/account/data">Export my data</Link>
      </section>
    </div>
  );
}
