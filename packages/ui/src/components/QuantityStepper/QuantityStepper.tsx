'use client';

import { useId, type ChangeEvent } from 'react';
import styles from './QuantityStepper.module.css';

export interface QuantityStepperProps {
  value: number;
  onChange: (value: number) => void;
  /** Smallest selectable value. Default `0`. */
  min?: number;
  /** Largest selectable value. Default unbounded. */
  max?: number;
  /** Amount +/- adjusts by. Default `1` — pass e.g. `0.5` for fractional
   *  quantities (kg, L). */
  step?: number;
  /** Read-only suffix shown after the number, e.g. "pcs" or "kg" — for
   *  compact contexts (a list row) where a separate unit selector doesn't
   *  fit. Editable unit selection (a `<Select>` of units) lives outside
   *  this component. */
  unit?: string;
  'aria-label': string;
  disabled?: boolean;
  id?: string;
  className?: string;
}

/**
 * QuantityStepper — a numeric input with +/- buttons and an optional
 * read-only unit suffix. Built for grocery/inventory-style quantities
 * (Sovereign Shopper, SHP-06) — supports fractional `step` values since
 * quantities like "1.5 kg" are common, unlike a typical integer counter.
 *
 * The middle field is a real `<input type="number">` so keyboard entry,
 * paste, and the browser's native numeric affordances all work — the
 * buttons are a convenience on top, not the only way to change the value.
 */
export function QuantityStepper({
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  unit,
  'aria-label': ariaLabel,
  disabled = false,
  id,
  className,
}: QuantityStepperProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  function clamp(next: number): number {
    let result = next;
    if (min !== undefined) result = Math.max(min, result);
    if (max !== undefined) result = Math.min(max, result);
    // Avoid float drift (0.1 + 0.2 style errors) from repeated +/- clicks.
    return Math.round(result * 1000) / 1000;
  }

  function handleInputChange(e: ChangeEvent<HTMLInputElement>) {
    const parsed = Number.parseFloat(e.target.value);
    if (!Number.isNaN(parsed)) onChange(clamp(parsed));
  }

  const decrementDisabled = disabled || (min !== undefined && value <= min);
  const incrementDisabled = disabled || (max !== undefined && value >= max);

  return (
    <div className={[styles.root, className].filter(Boolean).join(' ')}>
      <button
        type="button"
        className={styles.button}
        onClick={() => onChange(clamp(value - step))}
        disabled={decrementDisabled}
        aria-label={`Decrease ${ariaLabel}`}
      >
        −
      </button>
      <input
        id={inputId}
        type="number"
        className={styles.input}
        value={value}
        onChange={handleInputChange}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        aria-label={ariaLabel}
      />
      {unit && (
        <span className={styles.unit} aria-hidden>
          {unit}
        </span>
      )}
      <button
        type="button"
        className={styles.button}
        onClick={() => onChange(clamp(value + step))}
        disabled={incrementDisabled}
        aria-label={`Increase ${ariaLabel}`}
      >
        +
      </button>
    </div>
  );
}
