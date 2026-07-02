import type { ReactNode } from 'react';
import { useId } from 'react';
import styles from './FormField.module.css';

/** Props to spread onto the field's actual form control. */
export interface FormFieldRenderProps {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  required?: boolean;
}

export interface FormFieldProps {
  label: string;
  hint?: string;
  error?: string;
  /** Explicit control id. Auto-generated via `useId()` when omitted. */
  id?: string;
  required?: boolean;
  className?: string;
  /** Render prop — receives the props that must be spread onto the control
   * so the label, hint, and error stay associated with it. */
  children: (field: FormFieldRenderProps) => ReactNode;
}

/**
 * FormField — accessible label + hint/error wrapper for a single form control.
 * Wires `htmlFor`/`id` and `aria-describedby`/`aria-invalid` onto the control
 * itself (via the render-prop `field` object), not a surrounding element, so
 * screen readers reliably announce the hint or error as part of the control.
 */
export function FormField({
  label,
  hint,
  error,
  id,
  required = false,
  className,
  children,
}: FormFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const hintId = `${fieldId}-hint`;
  const errorId = `${fieldId}-error`;
  const describedBy =
    [hint && !error && hintId, error && errorId].filter(Boolean).join(' ') || undefined;

  const field: FormFieldRenderProps = {
    id: fieldId,
    'aria-describedby': describedBy,
    'aria-invalid': error ? true : undefined,
    required: required || undefined,
  };

  return (
    <div className={[styles.field, className].filter(Boolean).join(' ')}>
      <label className={styles.label} htmlFor={fieldId}>
        {label}
        {required && (
          <span className={styles.required} aria-hidden="true">
            *
          </span>
        )}
      </label>
      {children(field)}
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
