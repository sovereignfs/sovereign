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
    </span>
  );
}
