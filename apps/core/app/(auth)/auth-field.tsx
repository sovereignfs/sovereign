import { useId, type ReactNode } from 'react';
import styles from './auth.module.css';

export type AuthFieldControl = {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
};

/**
 * A labelled box on the pages before sign-in: the label above, small and muted, with no asterisk (every box
 * here is needed, and the browser says so when one is empty), an optional line of help beneath, and a small
 * link on the label's right (such as "Forgot password?"). The control is given what ties it to its label.
 */
export function AuthField({
  label,
  hint,
  error,
  aside,
  children,
}: {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  /** Something to the right of the label, usually a link. */
  aside?: ReactNode;
  children: (control: AuthFieldControl) => ReactNode;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = error ? errorId : hint ? hintId : undefined;
  return (
    <div className={styles.field}>
      <div className={styles.labelRow}>
        <label htmlFor={id} className={styles.label}>
          {label}
        </label>
        {aside}
      </div>
      {children({
        id,
        ...(describedBy ? { 'aria-describedby': describedBy } : {}),
        ...(error ? { 'aria-invalid': true } : {}),
      })}
      {hint && !error ? (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className={styles.fieldError} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
