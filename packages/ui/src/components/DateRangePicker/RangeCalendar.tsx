'use client';

import { type KeyboardEvent as ReactKeyboardEvent, useRef, useState } from 'react';
import { Icon } from '../Icon/Icon';
import calendarStyles from '../Calendar/Calendar.module.css';
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
} from '../Calendar/dateUtils';
import { type Range, nightsBetween, nightsLabel, rangeOf } from './rangeUtils';
import styles from './DateRangePicker.module.css';

export interface RangeCalendarProps {
  /** The range chosen, or `null` for none. */
  value: Range | null;
  /** Called when a second date completes a range. */
  onChange: (range: Range) => void;
  /** Dates before this are disabled and unselectable. */
  minDate?: Date | undefined;
  /** Dates after this are disabled and unselectable. */
  maxDate?: Date | undefined;
  'aria-label'?: string;
}

const WEEKDAY_LABEL_WEEK = getMonthGrid(new Date(2026, 0, 1))[0] ?? [];

/**
 * RangeCalendar — a month grid that picks two dates. **The first pick starts a range and the second ends it** (the earlier of the two is the start, whichever came first); the days between are shaded as the pointer or focus moves, and the nights
 * between are said. Keyboard as `Calendar`'s (the WAI-ARIA grid pattern, roving tabindex): arrows move by day and week, Home and End to the ends of the week, PageUp and PageDown by month, Enter or Space picks. Dates outside `minDate` and
 * `maxDate` are disabled. A pick on one day twice is a range of one day (no nights).
 */
export function RangeCalendar({
  value,
  onChange,
  minDate,
  maxDate,
  'aria-label': ariaLabel,
}: RangeCalendarProps) {
  const [displayedMonth, setDisplayedMonth] = useState(() =>
    startOfMonth(value?.start ?? new Date()),
  );
  const [focusedDate, setFocusedDate] = useState(() => value?.start ?? new Date());
  /** The first date of a range being chosen. */
  const [first, setFirst] = useState<Date | null>(null);
  /** The date the pointer or focus is on while choosing, for the shading. */
  const [hover, setHover] = useState<Date | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const weeks = getMonthGrid(displayedMonth);

  const shown: Range | null = first ? rangeOf(first, hover ?? first) : value;

  function goToMonth(next: Date) {
    setDisplayedMonth(startOfMonth(next));
  }
  function moveFocus(next: Date) {
    setFocusedDate(next);
    if (first) setHover(next);
    if (!isSameMonth(next, displayedMonth)) goToMonth(next);
    requestAnimationFrame(() => {
      gridRef.current?.querySelector<HTMLButtonElement>('[tabindex="0"]')?.focus();
    });
  }
  function pick(date: Date) {
    if (!isWithinRange(date, minDate, maxDate)) return;
    setFocusedDate(date);
    if (!first) {
      setFirst(date);
      setHover(date);
      return;
    }
    const range = rangeOf(first, date);
    setFirst(null);
    setHover(null);
    onChange(range);
  }

  function handleKeyDown(e: ReactKeyboardEvent) {
    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        return moveFocus(addDays(focusedDate, -1));
      case 'ArrowRight':
        e.preventDefault();
        return moveFocus(addDays(focusedDate, 1));
      case 'ArrowUp':
        e.preventDefault();
        return moveFocus(addDays(focusedDate, -7));
      case 'ArrowDown':
        e.preventDefault();
        return moveFocus(addDays(focusedDate, 7));
      case 'Home':
        e.preventDefault();
        return moveFocus(addDays(focusedDate, -focusedDate.getDay()));
      case 'End':
        e.preventDefault();
        return moveFocus(addDays(focusedDate, 6 - focusedDate.getDay()));
      case 'PageUp':
        e.preventDefault();
        return moveFocus(addMonths(focusedDate, -1));
      case 'PageDown':
        e.preventDefault();
        return moveFocus(addMonths(focusedDate, 1));
      case 'Escape':
        // Abandons a range being chosen, and nothing else (a dialog around this closes on Escape itself).
        if (first) {
          setFirst(null);
          setHover(null);
        }
        return;
      case 'Enter':
      case ' ':
        e.preventDefault();
        return pick(focusedDate);
      default:
    }
  }

  const nights = shown ? nightsBetween(shown.start, shown.end) : null;

  return (
    <div className={calendarStyles.calendar} aria-label={ariaLabel}>
      <div className={calendarStyles.header}>
        <button
          type="button"
          className={calendarStyles.navButton}
          aria-label="Previous month"
          onClick={() => goToMonth(addMonths(displayedMonth, -1))}
        >
          <Icon name="chevron-left" size="sm" aria-hidden />
        </button>
        <span className={calendarStyles.monthLabel}>{formatMonthYear(displayedMonth)}</span>
        <button
          type="button"
          className={calendarStyles.navButton}
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
        className={calendarStyles.grid}
        onKeyDown={handleKeyDown}
        tabIndex={-1}
      >
        <div role="row" className={calendarStyles.weekdayRow}>
          {WEEKDAY_LABEL_WEEK.map((d) => (
            <span
              key={d.getDay()}
              role="columnheader"
              className={calendarStyles.weekday}
              aria-hidden
            >
              {formatWeekdayShort(d)}
            </span>
          ))}
        </div>
        {weeks.map((week) => {
          const firstDayOfWeek = week[0];
          if (!firstDayOfWeek) return null;
          return (
            <div role="row" className={calendarStyles.week} key={firstDayOfWeek.toISOString()}>
              {week.map((date) => {
                const isCurrentMonth = isSameMonth(date, displayedMonth);
                const isStart = shown !== null && isSameDay(date, shown.start);
                const isEnd = shown !== null && isSameDay(date, shown.end);
                const inside =
                  shown !== null &&
                  nightsBetween(shown.start, date) > 0 &&
                  nightsBetween(date, shown.end) > 0;
                const isToday = isSameDay(date, new Date());
                const disabled = !isWithinRange(date, minDate, maxDate);
                return (
                  <div
                    role="gridcell"
                    aria-selected={isStart || isEnd || inside}
                    key={date.toISOString()}
                    className={[
                      styles.cell,
                      inside ? styles.cellInside : '',
                      isStart && !isEnd ? styles.cellStart : '',
                      isEnd && !isStart ? styles.cellEnd : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <button
                      type="button"
                      tabIndex={isSameDay(date, focusedDate) ? 0 : -1}
                      disabled={disabled}
                      aria-current={isToday ? 'date' : undefined}
                      aria-label={formatDateLabel(date)}
                      aria-pressed={isStart || isEnd}
                      className={[
                        calendarStyles.day,
                        !isCurrentMonth ? calendarStyles.dayOutside : '',
                        isStart || isEnd ? calendarStyles.daySelected : '',
                        isToday && !(isStart || isEnd) ? calendarStyles.dayToday : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => pick(date)}
                      onFocus={() => {
                        setFocusedDate(date);
                        if (first) setHover(date);
                      }}
                      onMouseEnter={() => first && !disabled && setHover(date)}
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
      <p className={styles.summary} role="status">
        {first
          ? 'Now choose the last day.'
          : nights === null
            ? 'Choose the first day.'
            : nightsLabel(nights)}
      </p>
    </div>
  );
}
