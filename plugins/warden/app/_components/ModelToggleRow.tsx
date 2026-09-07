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
 *
 * The optimistic value has to *follow* the server's when that changes, not
 * just seed from it. A `useState` initializer runs only on mount, and
 * `router.refresh()` re-renders this component without remounting it — so
 * the group-level "Show all"/"Hide all" (`ModelsView`) wrote every row
 * correctly and then appeared to do nothing at all, until a full page
 * reload. Same class of bug as the chat view needing an explicit `key` on
 * the resolved session. Adjusting state during render when a prop changes
 * is React's own documented alternative to a `useEffect` for this.
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
  const [lastServerVisible, setLastServerVisible] = useState(visible);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  if (visible !== lastServerVisible) {
    setLastServerVisible(visible);
    setOptimisticVisible(visible);
  }

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
