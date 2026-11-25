'use client';

import { useState } from 'react';
import { Icon, type IconName } from '../Icon/Icon';
import { Popover } from '../Popover/Popover';
import styles from './IconPicker.module.css';

export interface IconPickerProps {
  value: IconName | null;
  onChange: (icon: IconName) => void;
  /** Icons offered in the grid, in display order. */
  options: readonly IconName[];
  'aria-label': string;
  /** Shown next to the trigger's icon preview, e.g. the item's name. */
  triggerLabel?: string;
  disabled?: boolean;
  className?: string;
  /**
   * Which edge of the trigger the panel aligns to (`Popover`'s `align`). Default `'auto'`: opens leftwards from the
   * trigger where there is room for it, and rightwards where there is not, so a picker at the left of a page, or of a
   * row, is never cut off.
   */
  align?: 'left' | 'right' | 'auto';
}

/**
 * IconPicker — a trigger button showing the current icon that opens a
 * `Popover` grid of selectable icons. Built for cases with a curated,
 * bounded icon set (e.g. Sovereign Shopper's grocery category icons,
 * SHP-05) rather than the full design-system icon library.
 *
 * The panel opens on the side of the trigger that has room (`align`), so the picker can sit
 * at either end of a row.
 *
 * Selecting an icon both closes the picker and calls `onChange` — a
 * consumer's `onChange` never needs to close the picker itself.
 */
export function IconPicker({
  value,
  onChange,
  options,
  'aria-label': ariaLabel,
  triggerLabel,
  disabled = false,
  className,
  align = 'auto',
}: IconPickerProps) {
  const [open, setOpen] = useState(false);

  const trigger = (
    <button
      type="button"
      className={[styles.trigger, className].filter(Boolean).join(' ')}
      onClick={() => setOpen((o) => !o)}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-haspopup="true"
      aria-expanded={open}
    >
      {value ? (
        <Icon name={value} size="md" aria-hidden />
      ) : (
        <span className={styles.placeholder} aria-hidden>
          ?
        </span>
      )}
      {triggerLabel && <span className={styles.triggerLabel}>{triggerLabel}</span>}
    </button>
  );

  return (
    <Popover
      trigger={trigger}
      open={open}
      onClose={() => setOpen(false)}
      align={align}
      width={240}
      aria-label={`${ariaLabel} options`}
    >
      <div className={styles.grid} role="listbox" aria-label={ariaLabel}>
        {options.map((name) => (
          <button
            key={name}
            type="button"
            role="option"
            aria-selected={name === value}
            className={[styles.option, name === value ? styles.optionSelected : '']
              .filter(Boolean)
              .join(' ')}
            onClick={() => {
              onChange(name);
              setOpen(false);
            }}
          >
            <Icon name={name} size="md" aria-hidden />
          </button>
        ))}
      </div>
    </Popover>
  );
}
