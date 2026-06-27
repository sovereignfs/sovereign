import type { ReactNode } from 'react';
import { useId } from 'react';
import styles from './FormField.module.css';

export interface FormFieldProps {
  label: string;
  hint?: string;
  error?: string;
  htmlFor?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

export function FormField({
  label,
  hint,
  error,
  htmlFor,
  required = false,
  children,
  className,
}: FormFieldProps) {
  const hintId = useId();
  const errorId = useId();
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={[styles.field, className].filter(Boolean).join(' ')}>
      <label className={styles.label} htmlFor={htmlFor}>
        {label}
        {required && (
          <span className={styles.required} aria-hidden="true">
            *
          </span>
        )}
      </label>
      {/* Clone the child to inject aria-describedby — or just render children
          and let the consumer wire htmlFor/id themselves */}
      <div aria-describedby={describedBy}>{children}</div>
      {hint && !error && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
