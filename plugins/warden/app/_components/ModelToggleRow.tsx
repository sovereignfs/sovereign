'use client';

import { useState, useTransition } from 'react';
import { Toggle, useToast } from '@sovereignfs/ui';
import { setModelVisibilityAction } from '../actions';
import styles from './models.module.css';

/**
 * One model's visibility switch (Models settings page). Optimistic —
 * flips immediately on click rather than waiting for a `router.refresh()`
 * round trip, since a settings list with many rows should feel instant.
 * Reverts and toasts on a genuine failure (e.g. a DB write error); there's
 * no form input to preserve here, so this calls the server action directly
 * inside `startTransition` rather than going through `useActionState`.
 */
export function ModelToggleRow({
  modelKey,
  label,
  visible,
}: {
  modelKey: string;
  label: string;
  visible: boolean;
}) {
  const [optimisticVisible, setOptimisticVisible] = useState(visible);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function handleChange(nextVisible: boolean) {
    const previousVisible = optimisticVisible;
    setOptimisticVisible(nextVisible);
    startTransition(async () => {
      const result = await setModelVisibilityAction(modelKey, nextVisible);
      if (!result.ok) {
        setOptimisticVisible(previousVisible);
        toast.show({ title: result.error, category: 'error' });
      }
    });
  }

  return (
    <div className={styles.modelRow}>
      <span className={styles.modelLabel}>{label}</span>
      <Toggle
        checked={optimisticVisible}
        onChange={handleChange}
        disabled={pending}
        aria-label={`Show ${label} in the chat model selector`}
      />
    </div>
  );
}
