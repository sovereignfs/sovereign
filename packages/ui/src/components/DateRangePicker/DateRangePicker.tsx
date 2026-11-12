'use client';

import { useState } from 'react';
import { useIsMobile } from '../../hooks';
import { formatDateShort } from '../Calendar/dateUtils';
import { Drawer } from '../Drawer/Drawer';
import pickerStyles from '../DatePicker/DatePicker.module.css';
import { Icon } from '../Icon/Icon';
import { Popover } from '../Popover/Popover';
import { RangeCalendar } from './RangeCalendar';
import { nightsBetween, nightsLabel, parseIso, toIso } from './rangeUtils';

/** A range of calendar dates as `YYYY-MM-DD`, in and out: no time, no zone. Either end is `null` for no choice yet. */
export interface DateRange {
  start: string | null;
  end: string | null;
}

export interface DateRangePickerProps {
  value: DateRange;
  /** Called with both ends once a range is complete; the earlier date is `start`. */
  onChange: (range: { start: string; end: string }) => void;
  /** `YYYY-MM-DD`: earlier dates are disabled. */
  min?: string | undefined;
  /** `YYYY-MM-DD`: later dates are disabled. */
  max?: string | undefined;
  placeholder?: string;
  'aria-label': string;
  disabled?: boolean;
}

// The seven columns of the grid at the touch size, as DatePicker's.
const POPOVER_WIDTH = 320;

/**
 * DateRangePicker — a form field that picks two dates, such as a stop's arrival and departure: a trigger that says the range and the nights between (`10 May 2026 – 12 May 2026 · 2 nights`), opening a `RangeCalendar` in a popover on
 * a wide screen and a bottom sheet on a narrow one, as `DatePicker` does. **Dates in and out are `YYYY-MM-DD` strings**, because the date a person means has no time or zone to be wrong in; `min` and `max` disable the days outside them;
 * the keyboard is the calendar grid's. Choosing the second date closes it.
 */
export function DateRangePicker({
  value,
  onChange,
  min,
  max,
  placeholder = 'Select dates',
  'aria-label': ariaLabel,
  disabled = false,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();
  const start = parseIso(value.start);
  const end = parseIso(value.end);
  const range = start && end ? { start, end } : null;

  function handleChange(next: { start: Date; end: Date }) {
    onChange({ start: toIso(next.start), end: toIso(next.end) });
    setOpen(false);
  }

  const trigger = (
    <button
      type="button"
      className={pickerStyles.trigger}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={() => setOpen((o) => !o)}
    >
      <span className={range ? pickerStyles.triggerValue : pickerStyles.triggerPlaceholder}>
        {range
          ? `${formatDateShort(range.start)} – ${formatDateShort(range.end)} · ${nightsLabel(nightsBetween(range.start, range.end))}`
          : placeholder}
      </span>
      <Icon name="calendar" size="sm" aria-hidden />
    </button>
  );

  const calendar = (
    <RangeCalendar
      value={range}
      onChange={handleChange}
      minDate={parseIso(min)}
      maxDate={parseIso(max)}
      aria-label={ariaLabel}
    />
  );

  if (isMobile) {
    return (
      <>
        {trigger}
        <Drawer open={open} onClose={() => setOpen(false)} aria-label={ariaLabel}>
          <div className={pickerStyles.drawerBody}>{calendar}</div>
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
      <div className={pickerStyles.popoverBody}>{calendar}</div>
    </Popover>
  );
}
