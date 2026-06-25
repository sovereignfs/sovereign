'use client';

import type { ButtonHTMLAttributes } from 'react';
import styles from './Toggle.module.css';

export interface ToggleProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'onChange' | 'aria-label'
> {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  'aria-label': string;
}

/**
 * Toggle — 38×22px binary switch for settings rows.
 *
 * Renders as `<button role="switch">` rather than a hidden `<input type="checkbox">`
 * to avoid iOS VoiceOver focus quirks on visually styled checkboxes. The `aria-label`
 * prop is required because the control has no visible text label of its own.
 */
export function Toggle({ checked, onChange, disabled, className, ...rest }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className={[styles.track, checked ? styles.on : styles.off, className]
        .filter(Boolean)
        .join(' ')}
      onClick={() => onChange(!checked)}
      {...rest}
    >
      <span className={styles.thumb} />
    </button>
  );
}
