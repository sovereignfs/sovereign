'use client';

import { useId } from 'react';
import styles from './RadioGroup.module.css';

export interface RadioGroupItem {
  label: string;
  value: string;
  disabled?: boolean;
}

export interface RadioGroupProps {
  items: RadioGroupItem[];
  value: string;
  onChange: (value: string) => void;
  /** Groups the underlying native radios. Auto-generated when omitted —
   * only pass this to participate in a native, non-React form submission. */
  name?: string;
  /** Disables every item. Use `items[].disabled` to disable one. */
  disabled?: boolean;
  id?: string;
  className?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  required?: boolean;
}

/**
 * RadioGroup — single-select list of options.
 *
 * Renders real `<input type="radio">` elements sharing one `name`, visually
 * hidden behind a custom circle (same technique as `Checkbox`). Keyboard
 * arrow-key navigation between options is native browser behavior for
 * grouped radio inputs — nothing to hand-roll here.
 */
export function RadioGroup({
  items,
  value,
  onChange,
  name,
  disabled,
  id,
  className,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  required,
}: RadioGroupProps) {
  const generatedName = useId();
  const groupName = name ?? generatedName;

  return (
    <div
      id={id}
      role="radiogroup"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      aria-describedby={ariaDescribedBy}
      aria-invalid={ariaInvalid}
      aria-required={required}
      className={[styles.root, className].filter(Boolean).join(' ')}
    >
      {items.map((item) => {
        const checked = item.value === value;
        const itemDisabled = disabled || item.disabled;
        const inputId = `${groupName}-${item.value}`;

        return (
          <label
            key={item.value}
            htmlFor={inputId}
            className={[styles.option, itemDisabled ? styles.disabled : '']
              .filter(Boolean)
              .join(' ')}
          >
            <span className={[styles.circle, checked ? styles.checked : ''].join(' ')}>
              <input
                id={inputId}
                type="radio"
                name={groupName}
                value={item.value}
                checked={checked}
                disabled={itemDisabled}
                required={required}
                className={styles.input}
                onChange={() => onChange(item.value)}
              />
              {checked && <span className={styles.dot} />}
            </span>
            <span className={styles.optionLabel}>{item.label}</span>
          </label>
        );
      })}
    </div>
  );
}
