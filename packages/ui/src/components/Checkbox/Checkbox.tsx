'use client';

import type { InputHTMLAttributes } from 'react';
import styles from './Checkbox.module.css';

export interface CheckboxProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'onChange'
> {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  /** Renders the label with a strike-through when checked. */
  strikeThrough?: boolean;
  disabled?: boolean;
}

export function Checkbox({
  checked,
  onChange,
  label,
  strikeThrough = false,
  disabled,
  className,
  id,
  ...rest
}: CheckboxProps) {
  const inputId = id ?? `checkbox-${label.toLowerCase().replace(/\s+/g, '-')}`;

  return (
    <span className={[styles.root, className].filter(Boolean).join(' ')}>
      <span className={[styles.box, checked ? styles.checked : ''].filter(Boolean).join(' ')}>
        <input
          {...rest}
          id={inputId}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          className={styles.input}
          onChange={(e) => onChange(e.target.checked)}
        />
        {checked && (
          <svg className={styles.tick} viewBox="0 0 10 8" fill="none" aria-hidden="true">
            <path
              d="M1 4l3 3 5-6"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
      {/* Callers pass label="" for icon-only/screen-reader-only usage (an
          aria-label on the Checkbox's own root covers accessibility in that
          case) — omitting the element entirely, rather than rendering an
          empty <label>, matters because .root's flex `gap` still applies
          between .box and a rendered-but-empty label, silently adding an
          extra --sv-space-2 of invisible space after the checkbox that
          every icon-only consumer was unknowingly stacking on top of their
          own layout's spacing. */}
      {label && (
        <label
          htmlFor={inputId}
          className={[
            styles.label,
            strikeThrough && checked ? styles.struck : '',
            disabled ? styles.disabled : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {label}
        </label>
      )}
    </span>
  );
}
