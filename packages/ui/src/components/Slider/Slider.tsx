'use client';

import { useId } from 'react';
import type { CSSProperties } from 'react';
import styles from './Slider.module.css';

export interface SliderProps {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  /** Renders a visible label above the track. Omit and pass `aria-label`
   * instead for a standalone, unlabeled slider. */
  label?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  required?: boolean;
}

/**
 * Slider — single-thumb range input.
 *
 * A native `<input type="range">` under custom track/thumb styling — arrow
 * key (adjust by `step`), Home/End (jump to min/max), and touch-drag
 * support all come from the browser, nothing hand-rolled. Dual-thumb/range
 * selection is out of scope until a consumer needs it.
 */
export function Slider({
  value,
  onChange,
  min,
  max,
  step,
  label,
  disabled,
  id,
  className,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  required,
}: SliderProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const fillPercent = max > min ? ((value - min) / (max - min)) * 100 : 0;

  return (
    <div className={[styles.root, className].filter(Boolean).join(' ')}>
      {label && (
        <label htmlFor={inputId} className={styles.label}>
          {label}
        </label>
      )}
      <input
        id={inputId}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        required={required}
        aria-label={label ? undefined : ariaLabel}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        className={styles.slider}
        style={{ '--slider-fill': `${fillPercent}%` } as CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}
