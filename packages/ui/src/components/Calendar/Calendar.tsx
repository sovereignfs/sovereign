'use client';

import { type KeyboardEvent as ReactKeyboardEvent, useRef, useState } from 'react';
import { Icon } from '../Icon/Icon';
import {
  addDays,
  addMonths,
  formatDateLabel,
  formatMonthYear,
  formatWeekdayShort,
  getMonthGrid,
  isSameDay,
  isSameMonth,
  isWithinRange,
  startOfMonth,
} from './dateUtils';
import styles from './Calendar.module.css';

export interface CalendarProps {
  /** Selected date, or `null` for no selection. */
  value: Date | null;
  onChange: (date: Date) => void;
  /** Dates before this are disabled and unselectable. */
  minDate?: Date;
  /** Dates after this are disabled and unselectable. */
  maxDate?: Date;
  'aria-label'?: string;
}

// A week's worth of dates, used once to derive the weekday header labels —
// any Sunday-starting week works since only the day-of-week repeats.
// getMonthGrid always returns 6 weeks (see its own doc comment), so index 0
// is guaranteed to exist — the `?? []` is purely to satisfy the lint rule
// against non-null assertions, not a real runtime possibility.
const WEEKDAY_LABEL_WEEK = getMonthGrid(new Date(2026, 0, 1))[0] ?? [];

/**
 * Calendar — a keyboard-navigable month grid. Date-only (no time or range
 * selection — decision D6 in the mobile design-system plan); a `DatePicker`
 * field wraps this in a `Popover` (desktop) or `Drawer` (mobile).
 *
 * Keyboard (WAI-ARIA APG grid pattern, roving tabindex — exactly one day
 * button is ever tab-stoppable): arrow keys move focus by day/week, Home/End
 * jump to the start/end of the focused week, PageUp/PageDown change month,
 * Enter/Space selects the focused date. Navigating into an adjacent month
 * (arrow keys at a week's edge, or PageUp/PageDown) updates the displayed
 * month to follow focus.
 */
export function Calendar({
  value,
  onChange,
  minDate,
  maxDate,
  'aria-label': ariaLabel,
}: CalendarProps) {
  const [displayedMonth, setDisplayedMonth] = useState(() => startOfMonth(value ?? new Date()));
  // The roving-tabindex date. Independent of `value` — you can arrow around
  // without selecting; Enter/Space is what commits a selection.
  const [focusedDate, setFocusedDate] = useState(() => value ?? new Date());
  const gridRef = useRef<HTMLDivElement>(null);

  const weeks = getMonthGrid(displayedMonth);

  function goToMonth(next: Date) {
    setDisplayedMonth(startOfMonth(next));
  }

  function moveFocus(next: Date) {
    setFocusedDate(next);
    if (!isSameMonth(next, displayedMonth)) goToMonth(next);
    // Focus is applied after the grid re-renders with the new roving
    // tabindex target — see the ref callback below on each day button,
    // which focuses itself when it becomes the tabIndex=0 cell following a
    // keyboard-driven focus change (queued via requestAnimationFrame so the
    // DOM has committed the new grid first).
    requestAnimationFrame(() => {
      gridRef.current?.querySelector<HTMLButtonElement>('[tabindex="0"]')?.focus();
    });
  }

  function selectDate(date: Date) {
    if (!isWithinRange(date, minDate, maxDate)) return;
    onChange(date);
    setFocusedDate(date);
  }

  function handleKeyDown(e: ReactKeyboardEvent) {
    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        moveFocus(addDays(focusedDate, -1));
        return;
      case 'ArrowRight':
        e.preventDefault();
        moveFocus(addDays(focusedDate, 1));
        return;
      case 'ArrowUp':
        e.preventDefault();
        moveFocus(addDays(focusedDate, -7));
        return;
      case 'ArrowDown':
        e.preventDefault();
        moveFocus(addDays(focusedDate, 7));
        return;
      case 'Home':
        e.preventDefault();
        moveFocus(addDays(focusedDate, -focusedDate.getDay()));
        return;
      case 'End':
        e.preventDefault();
        moveFocus(addDays(focusedDate, 6 - focusedDate.getDay()));
        return;
      case 'PageUp':
        e.preventDefault();
        moveFocus(addMonths(focusedDate, -1));
        return;
      case 'PageDown':
        e.preventDefault();
        moveFocus(addMonths(focusedDate, 1));
        return;
      case 'Enter':
      case ' ':
        e.preventDefault();
        selectDate(focusedDate);
        return;
      default:
    }
  }

  return (
    <div className={styles.calendar} aria-label={ariaLabel}>
      <div className={styles.header}>
        <button
          type="button"
          className={styles.navButton}
          aria-label="Previous month"
          onClick={() => goToMonth(addMonths(displayedMonth, -1))}
        >
          <Icon name="chevron-left" size="sm" aria-hidden />
        </button>
        <span className={styles.monthLabel}>{formatMonthYear(displayedMonth)}</span>
        <button
          type="button"
          className={styles.navButton}
          aria-label="Next month"
          onClick={() => goToMonth(addMonths(displayedMonth, 1))}
        >
          <Icon name="chevron-right" size="sm" aria-hidden />
        </button>
      </div>

      <div
        ref={gridRef}
        role="grid"
        aria-label={formatMonthYear(displayedMonth)}
        className={styles.grid}
        onKeyDown={handleKeyDown}
        // Keyboard handling relies on roving tabindex on the day buttons
        // (real DOM focus + bubbling), not on this container being a tab
        // stop itself — tabIndex={-1} only satisfies jsx-a11y's expectation
        // that an element carrying a keydown handler + interactive role be
        // focusable; it does not change Tab-key reachability.
        tabIndex={-1}
      >
        <div role="row" className={styles.weekdayRow}>
          {WEEKDAY_LABEL_WEEK.map((d) => (
            <span key={d.getDay()} role="columnheader" className={styles.weekday} aria-hidden>
              {formatWeekdayShort(d)}
            </span>
          ))}
        </div>
        {weeks.map((week) => {
          const firstDayOfWeek = week[0];
          if (!firstDayOfWeek) return null;
          return (
            <div role="row" className={styles.week} key={firstDayOfWeek.toISOString()}>
              {week.map((date) => {
                const isCurrentMonth = isSameMonth(date, displayedMonth);
                const isSelected = value !== null && isSameDay(date, value);
                const isToday = isSameDay(date, new Date());
                const isFocusTarget = isSameDay(date, focusedDate);
                const disabled = !isWithinRange(date, minDate, maxDate);
                return (
                  <div role="gridcell" aria-selected={isSelected} key={date.toISOString()}>
                    <button
                      type="button"
                      tabIndex={isFocusTarget ? 0 : -1}
                      disabled={disabled}
                      aria-current={isToday ? 'date' : undefined}
                      aria-label={formatDateLabel(date)}
                      className={[
                        styles.day,
                        !isCurrentMonth ? styles.dayOutside : '',
                        isSelected ? styles.daySelected : '',
                        isToday && !isSelected ? styles.dayToday : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => selectDate(date)}
                      onFocus={() => setFocusedDate(date)}
                    >
                      {date.getDate()}
                    </button>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
