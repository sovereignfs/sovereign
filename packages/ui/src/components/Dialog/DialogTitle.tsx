'use client';

import { useContext, useEffect, useId, type ReactNode } from 'react';
import { DialogTitleIdContext } from './Dialog';
import styles from './DialogParts.module.css';

export interface DialogTitleProps {
  children: ReactNode;
  className?: string;
}

/**
 * DialogTitle — the dialog's heading, typically the first child of
 * `DialogHeader`. Registers its generated `id` with the nearest `Dialog`
 * ancestor (via context — this usually renders nested inside `DialogHeader`,
 * not as a direct child of `Dialog`, so a children-partition check can't find
 * it) so the panel's `aria-labelledby` can reference it, taking priority over
 * `Dialog`'s own `title`/`aria-label` props. A no-op registration (nothing
 * breaks, just nothing to reference) when rendered outside a `Dialog`.
 */
export function DialogTitle({ children, className }: DialogTitleProps) {
  const setTitleId = useContext(DialogTitleIdContext);
  const id = useId();

  useEffect(() => {
    if (!setTitleId) return;
    setTitleId(id);
    return () => setTitleId(null);
  }, [setTitleId, id]);

  return (
    <h2 id={id} className={[styles.title, className].filter(Boolean).join(' ')}>
      {children}
    </h2>
  );
}
