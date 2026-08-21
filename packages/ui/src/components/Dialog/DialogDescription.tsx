'use client';

import { useContext, useEffect, useId, type ReactNode } from 'react';
import { DialogDescriptionIdContext } from './Dialog';
import styles from './DialogParts.module.css';

export interface DialogDescriptionProps {
  children: ReactNode;
  className?: string;
}

/**
 * DialogDescription — supplementary text under `DialogTitle`, typically the
 * second child of `DialogHeader`. Registers its generated `id` with the
 * nearest `Dialog` ancestor (same context mechanism as `DialogTitle`, for the
 * same nesting reason) so the panel's `aria-describedby` picks it up — a
 * screen reader announces this alongside the dialog's accessible name on
 * open, instead of it being silent, easy-to-miss body text. A no-op
 * registration when rendered outside a `Dialog`.
 */
export function DialogDescription({ children, className }: DialogDescriptionProps) {
  const setDescriptionId = useContext(DialogDescriptionIdContext);
  const id = useId();

  useEffect(() => {
    if (!setDescriptionId) return;
    setDescriptionId(id);
    return () => setDescriptionId(null);
  }, [setDescriptionId, id]);

  return (
    <p id={id} className={[styles.description, className].filter(Boolean).join(' ')}>
      {children}
    </p>
  );
}
