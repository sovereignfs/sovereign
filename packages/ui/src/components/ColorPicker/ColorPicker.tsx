'use client';

import { Icon } from '../Icon/Icon';
import styles from './ColorPicker.module.css';

export interface ColorPickerSwatch {
  /** Accessible name and tooltip, e.g. "Sky". */
  label: string;
  /** 6-digit hex, e.g. "#b5c9e8". */
  value: string;
}

export interface ColorPickerProps {
  /** Curated quick-pick suggestions, in display order. */
  swatches: readonly ColorPickerSwatch[];
  /** Current hex value, or `null` for no color. Compared case-insensitively
   *  against `swatches` — a value that doesn't match any swatch renders as
   *  the active "custom" selection instead. */
  value: string | null;
  onChange: (value: string | null) => void;
  /** Shows a leading "no color" option. Off by default — most consumers
   *  (anything painting a fixed-size chip) always need a real color; only
   *  a board canvas-style consumer typically wants "none" as a real choice. */
  allowNone?: boolean;
  noneLabel?: string;
  /** Accessible name for the native color-input trigger that lets a user
   *  pick any color, not just a curated swatch. */
  customLabel?: string;
  disabled?: boolean;
  'aria-label': string;
  className?: string;
}

function normalize(hex: string): string {
  return hex.toLowerCase();
}

/**
 * ColorPicker — a row of curated swatch suggestions plus a native
 * `<input type="color">` trigger for picking any color, not just the
 * curated set. The native color input is deliberately not a custom-built
 * hue/saturation picker: it already gives every browser's own full-spectrum
 * picker (with an eyedropper tool in most), guarantees valid hex output, and
 * needs no bespoke a11y work of its own.
 *
 * `value` drives which affordance reads as selected: a hex matching a
 * swatch highlights that swatch; a hex matching none of them highlights the
 * custom trigger instead (its own dial shows that color); `null` (only
 * meaningful with `allowNone`) highlights the "no color" option.
 */
export function ColorPicker({
  swatches,
  value,
  onChange,
  allowNone = false,
  noneLabel = 'No color',
  customLabel = 'Custom color',
  disabled = false,
  'aria-label': ariaLabel,
  className,
}: ColorPickerProps) {
  const normalizedValue = value ? normalize(value) : null;
  const matchedSwatch = swatches.find((s) => normalize(s.value) === normalizedValue);
  const isCustomActive = normalizedValue !== null && !matchedSwatch;
  // The native input always needs a real hex to display (it has no "empty"
  // state) — the active custom color when there is one, otherwise a neutral
  // starting point for whenever it's next opened.
  const customDialValue = isCustomActive && value ? value : (swatches[0]?.value ?? '#000000');

  return (
    <div
      className={[styles.row, className].filter(Boolean).join(' ')}
      role="group"
      aria-label={ariaLabel}
    >
      {allowNone && (
        <button
          type="button"
          role="radio"
          aria-checked={value === null}
          aria-label={noneLabel}
          title={noneLabel}
          disabled={disabled}
          className={[styles.swatch, styles.swatchNone, value === null ? styles.swatchSelected : '']
            .filter(Boolean)
            .join(' ')}
          onClick={() => onChange(null)}
        >
          <Icon name="x" size="sm" aria-hidden={true} />
        </button>
      )}
      {swatches.map((s) => (
        <button
          key={s.value}
          type="button"
          role="radio"
          aria-checked={normalize(s.value) === normalizedValue}
          aria-label={s.label}
          title={s.label}
          disabled={disabled}
          className={[
            styles.swatch,
            normalize(s.value) === normalizedValue ? styles.swatchSelected : '',
          ]
            .filter(Boolean)
            .join(' ')}
          style={{ backgroundColor: s.value }}
          onClick={() => onChange(s.value)}
        />
      ))}
      <span
        className={[styles.customWrapper, isCustomActive ? styles.swatchSelected : '']
          .filter(Boolean)
          .join(' ')}
      >
        <input
          type="color"
          className={styles.customInput}
          aria-label={customLabel}
          title={customLabel}
          disabled={disabled}
          value={customDialValue}
          onChange={(e) => onChange(e.target.value)}
        />
        <Icon name="pencil" size="xs" aria-hidden={true} className={styles.customIcon} />
      </span>
    </div>
  );
}
