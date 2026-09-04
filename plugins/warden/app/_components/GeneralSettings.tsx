'use client';

import { useId, useState, useTransition } from 'react';
import Link from 'next/link';
import { Button, ConfirmDialog, QuantityStepper, Select, useToast } from '@sovereignfs/ui';
import { deleteInactiveSessionsAction, setDefaultModelAction } from '../actions';
import { MAX_RETENTION_DAYS, MIN_RETENTION_DAYS } from '../_lib/limits';
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
  const [retentionResult, setRetentionResult] = useState<{
    message: string;
    ok: boolean;
  } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const toast = useToast();
  const baseId = useId();
  const defaultModelHeadingId = `${baseId}-default-model`;
  const defaultModelHelpId = `${baseId}-default-model-help`;

  function handleDefaultModelChange(value: string) {
    const previous = selectedModel;
    setSelectedModel(value);
    startModelTransition(async () => {
      const result = await setDefaultModelAction(value || null);
      // Optimistic, so a failure has to be surfaced and reverted — the
      // result used to be discarded, leaving the select showing a value
      // that was never written and the user finding out on their next new
      // session. Same pattern as `ModelToggleRow`.
      if (!result.ok) {
        setSelectedModel(previous);
        toast.show({ title: result.error, category: 'error' });
      }
    });
  }

  function handleDeleteInactive() {
    setRetentionResult(null);
    startRetentionTransition(async () => {
      const result = await deleteInactiveSessionsAction(retentionDays);
      setRetentionResult(
        result.ok ? { message: result.message, ok: true } : { message: result.error, ok: false },
      );
      setConfirmOpen(false);
    });
  }

  return (
    <div className={styles.sections}>
      <section className={styles.section} aria-labelledby={defaultModelHeadingId}>
        <h2 className={styles.sectionTitle} id={defaultModelHeadingId}>
          Default model
        </h2>
        <p className={styles.helpText} id={defaultModelHelpId}>
          Used to preselect a model whenever you start a new session. Existing sessions keep
          whatever model they were already using.
        </p>
        <Select
          // Sizes the wrapper, not the inner <select> — per `Select`'s own
          // doc comment, constraining the select alone leaves the chevron
          // sitting at full width, detached from the shrunken control.
          className={styles.modelSelect}
          value={selectedModel}
          onChange={(event) => handleDefaultModelChange(event.target.value)}
          // Points at the copy already on screen instead of repeating it in
          // an aria-label that could drift from the visible text.
          aria-labelledby={defaultModelHeadingId}
          aria-describedby={defaultModelHelpId}
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
            min={MIN_RETENTION_DAYS}
            max={MAX_RETENTION_DAYS}
            unit="days"
            aria-label="Inactivity threshold in days"
            disabled={retentionPending}
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setConfirmOpen(true)}
            disabled={retentionPending}
          >
            {retentionPending ? 'Deleting…' : 'Delete inactive sessions'}
          </Button>
        </div>
        {retentionResult && (
          // `role="status"` so the outcome is announced — it is the only
          // feedback this action gives, and it replaces nothing on screen.
          <p
            role="status"
            className={
              retentionResult.ok
                ? styles.feedbackText
                : `${styles.feedbackText} ${styles.feedbackTextError}`
            }
          >
            {retentionResult.message}
          </p>
        )}
        {/* Deleting one session already asks first; deleting an unknown
            number of them at once, permanently and with no undo, should
            not be the one destructive action that doesn't. */}
        <ConfirmDialog
          open={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          title="Delete inactive sessions?"
          message={
            <>
              This permanently deletes every chat with no activity in the last{' '}
              <strong>{retentionDays}</strong> {retentionDays === 1 ? 'day' : 'days'}. Pinned chats
              are kept. This can&rsquo;t be undone.
            </>
          }
          confirmLabel={retentionPending ? 'Deleting…' : 'Delete'}
          destructive
          pending={retentionPending}
          onConfirm={handleDeleteInactive}
        />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Export</h2>
        <p className={styles.helpText}>
          Your Warden chat history is included in your account-wide data export, alongside every
          other app&rsquo;s data.
        </p>
        {/* A Button, like every other action in this codebase — a bare
            <Link> here rendered as default-blue underlined browser chrome,
            the only control in the dialog that didn't look like one. */}
        <Link href="/account/data" className={styles.exportLink}>
          <Button variant="secondary" size="sm">
            Export my data
          </Button>
        </Link>
      </section>
    </div>
  );
}
