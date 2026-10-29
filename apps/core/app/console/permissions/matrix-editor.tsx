'use client';

import { startTransition, useActionState, useState } from 'react';
import { Alert, Button, Checkbox, ConfirmDialog } from '@sovereignfs/ui';
import type { MatrixRow } from '../../../src/roles/describe';
import { resetMatrixAction, saveMatrixAction, type MatrixResult } from './actions';
import styles from './permissions.module.css';

const ROLES = [
  { id: 'platform:admin', label: 'Admins', key: 'admin' },
  { id: 'platform:user', label: 'Users', key: 'user' },
] as const;

/**
 * What the admin and user roles may do. The owner always holds everything, so the owner has no boxes; what only
 * the owner may hold is listed with its boxes locked. Nothing is saved until the owner saves the whole table.
 */
export function MatrixEditor({ rows }: { rows: MatrixRow[] }) {
  const [held, setHeld] = useState(
    () =>
      new Set(
        rows.flatMap((row) =>
          ROLES.filter((r) => row[r.key]).map((r) => `${r.id}|${row.capability}`),
        ),
      ),
  );
  const [state, save, saving] = useActionState<MatrixResult | null, FormData>(
    saveMatrixAction,
    null,
  );
  const [confirming, setConfirming] = useState(false);
  const [resetState, reset, resetting] = useActionState<MatrixResult | null, null>(
    async (previous) => {
      const result = await resetMatrixAction(previous);
      if (result.ok) {
        setHeld(
          new Set(
            rows.flatMap((row) =>
              ROLES.filter((r) => row[`${r.key}Default`]).map((r) => `${r.id}|${row.capability}`),
            ),
          ),
        );
        setConfirming(false);
      }
      return result;
    },
    null,
  );
  const shown = resetState ?? state;
  const differs = rows.some(
    (row) => !row.ownerOnly && ROLES.some((r) => row[r.key] !== row[`${r.key}Default`]),
  );

  const toggle = (value: string, on: boolean) =>
    setHeld((before) => {
      const next = new Set(before);
      if (on) next.add(value);
      else next.delete(value);
      return next;
    });

  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        // A form action would reset the boxes when it finished, undoing what a refusal should leave.
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => save(data));
      }}
    >
      <ul className={styles.list}>
        {rows.map((row) => (
          <li key={row.capability} className={styles.row}>
            <div className={styles.what}>
              <span className={styles.label}>{row.label}</span>
              <span className={styles.description}>{row.description}</span>
            </div>
            <div className={styles.boxes}>
              {row.ownerOnly ? (
                <span className={styles.locked}>Only the owner</span>
              ) : (
                ROLES.map((r) => {
                  const value = `${r.id}|${row.capability}`;
                  return (
                    <Checkbox
                      key={r.id}
                      id={`grant-${r.key}-${row.capability.replace(':', '-')}`}
                      name="grant"
                      value={value}
                      label={r.label}
                      checked={held.has(value)}
                      onChange={(on) => toggle(value, on)}
                    />
                  );
                })
              )}
            </div>
          </li>
        ))}
      </ul>
      <div className={styles.buttons}>
        <Button type="submit" loading={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
        {differs ? (
          <Button type="button" variant="secondary" onClick={() => setConfirming(true)}>
            Back to the defaults
          </Button>
        ) : null}
      </div>
      {shown?.ok ? <Alert variant="success">{shown.message}</Alert> : null}
      {shown && !shown.ok ? <Alert variant="error">{shown.error}</Alert> : null}
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Go back to the defaults?"
        message="Admins and users get exactly what a new instance gives them. Your changes are lost."
        confirmLabel={resetting ? 'Resetting…' : 'Back to the defaults'}
        destructive
        pending={resetting}
        error={resetState && !resetState.ok ? resetState.error : undefined}
        onConfirm={() => startTransition(() => reset(null))}
      />
    </form>
  );
}
