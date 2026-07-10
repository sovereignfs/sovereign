'use client';

import { useState } from 'react';
import { useIsMobile } from '../../hooks';
import { Calendar } from '../Calendar/Calendar';
import { formatDateShort } from '../Calendar/dateUtils';
import { Drawer } from '../Drawer/Drawer';
import { Icon } from '../Icon/Icon';
import { Popover } from '../Popover/Popover';
import styles from './DatePicker.module.css';

export interface DatePickerProps {
  value: Date | null;
  onChange: (date: Date) => void;
  minDate?: Date;
  maxDate?: Date;
  placeholder?: string;
  'aria-label': string;
  disabled?: boolean;
}

// Wide enough for the 7-column Calendar grid (44px touch-target cells) plus
// its own padding, without being so wide it looks odd as a Popover panel.
const POPOVER_WIDTH = 320;

/**
 * DatePicker — a form field pairing a compact trigger with `Calendar`:
 * `Popover` on desktop, a bottom-sheet `Drawer` on mobile (the platform's
 * standard adaptive-surface pattern, matching `Menu`). Date-only (decision
 * D6 in the mobile design-system plan) — time and range selection are future
 * scope; recurrence UI stays plugin-side.
 *
 * Unlike `Menu`, the trigger is built in rather than supplied by the caller
 * — a date picker is a form field (consistent with `Input`/`Select`), not an
 * arbitrary action-menu trigger.
 */
export function DatePicker({
  value,
  onChange,
  minDate,
  maxDate,
  placeholder = 'Select date',
  'aria-label': ariaLabel,
  disabled = false,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();

  function handleSelect(date: Date) {
    onChange(date);
    setOpen(false);
  }

  const trigger = (
    <button
      type="button"
      className={styles.trigger}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={() => setOpen((o) => !o)}
    >
      <span className={value ? styles.triggerValue : styles.triggerPlaceholder}>
        {value ? formatDateShort(value) : placeholder}
      </span>
      <Icon name="calendar" size="sm" aria-hidden />
    </button>
  );

  const calendar = (
    <Calendar
      value={value}
      onChange={handleSelect}
      minDate={minDate}
      maxDate={maxDate}
      aria-label={ariaLabel}
    />
  );

  if (isMobile) {
    return (
      <>
        {trigger}
        <Drawer open={open} onClose={() => setOpen(false)} aria-label={ariaLabel}>
          <div className={styles.drawerBody}>{calendar}</div>
        </Drawer>
      </>
    );
  }

  return (
    <Popover
      trigger={trigger}
      open={open}
      onClose={() => setOpen(false)}
      aria-label={ariaLabel}
      width={POPOVER_WIDTH}
    >
      <div className={styles.popoverBody}>{calendar}</div>
    </Popover>
  );
}
