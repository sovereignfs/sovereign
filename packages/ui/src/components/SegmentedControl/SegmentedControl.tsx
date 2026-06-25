'use client';

import styles from './SegmentedControl.module.css';

export interface SegmentedOption<T extends string = string> {
  label: string;
  value: T;
}

export interface SegmentedControlProps<T extends string = string> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  size?: 'sm' | 'md';
  'aria-label': string;
}

/**
 * SegmentedControl — pill-based 2–3 option picker for inline use in table rows
 * and dialogs (e.g. User / Admin / Owner role switcher).
 *
 * Renders as `<div role="radiogroup">` with `<button role="radio">` children —
 * correct semantics without a native `<input type="radio">` (which needs an id/name
 * pair and a `<form>` context to function correctly in all browsers).
 */
export function SegmentedControl<T extends string = string>({
  value,
  onChange,
  options,
  size = 'md',
  'aria-label': ariaLabel,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={[styles.track, styles[size]].join(' ')}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            className={[styles.segment, active ? styles.active : styles.inactive].join(' ')}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
