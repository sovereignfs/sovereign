'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useIsMobile } from '../../hooks';
import { Drawer } from '../Drawer/Drawer';
import { Icon } from '../Icon/Icon';
import { Popover } from '../Popover/Popover';
import styles from './Combobox.module.css';

export interface ComboboxOption {
  value: string;
  label: string;
}

export interface ComboboxProps {
  options: ComboboxOption[];
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  'aria-label': string;
  disabled?: boolean;
  className?: string;
}

function matches(option: ComboboxOption, query: string): boolean {
  if (!query) return true;
  return option.label.toLowerCase().includes(query.toLowerCase());
}

/**
 * Combobox — a searchable single-select: `Popover` on desktop, a bottom-sheet
 * `Drawer` on mobile (the platform's standard adaptive-surface pattern,
 * matching `Menu` and `DatePicker`). For a fixed, short option list where
 * search adds no value, use `Select`'s native `<select>` instead — this is
 * for option lists long enough that typing to filter beats scanning.
 *
 * The trigger is built in, like `DatePicker` — a combobox is a form field,
 * not an arbitrary action-menu trigger.
 */
export function Combobox({
  options,
  value,
  onChange,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  emptyMessage = 'No matches.',
  'aria-label': ariaLabel,
  disabled = false,
  className,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const isMobile = useIsMobile();
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const selected = options.find((o) => o.value === value) ?? null;
  const filtered = useMemo(
    () => options.filter((option) => matches(option, query)),
    [options, query],
  );

  useEffect(() => {
    setHighlightedIndex(0);
  }, [query, open]);

  useEffect(() => {
    if (open) {
      setQuery('');
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  function commit(option: ComboboxOption) {
    onChange(option.value);
    setOpen(false);
  }

  function handleKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const option = filtered[highlightedIndex];
      if (option) commit(option);
    }
  }

  const highlightedId = filtered[highlightedIndex]
    ? `${listId}-${filtered[highlightedIndex].value}`
    : undefined;

  const trigger = (
    <button
      type="button"
      className={[styles.trigger, className].filter(Boolean).join(' ')}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-haspopup="listbox"
      aria-expanded={open}
      onClick={() => setOpen((o) => !o)}
    >
      <span className={selected ? styles.triggerValue : styles.triggerPlaceholder}>
        {selected ? selected.label : placeholder}
      </span>
      <Icon name="chevron-down" size="sm" aria-hidden />
    </button>
  );

  const body = (
    <div className={styles.body}>
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={filtered.length > 0}
        aria-controls={listId}
        aria-activedescendant={highlightedId}
        aria-autocomplete="list"
        className={styles.search}
        placeholder={searchPlaceholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      <ul id={listId} role="listbox" className={styles.list}>
        {filtered.length === 0 && <li className={styles.empty}>{emptyMessage}</li>}
        {filtered.map((option, index) => {
          const isHighlighted = index === highlightedIndex;
          const isSelected = option.value === value;
          return (
            <li key={option.value}>
              <button
                id={`${listId}-${option.value}`}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={[styles.option, isHighlighted ? styles.optionHighlighted : '']
                  .filter(Boolean)
                  .join(' ')}
                onMouseEnter={() => setHighlightedIndex(index)}
                onClick={() => commit(option)}
              >
                <span className={styles.check}>
                  {isSelected && <Icon name="check" size="sm" aria-hidden />}
                </span>
                {option.label}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );

  if (isMobile) {
    return (
      <>
        {trigger}
        <Drawer open={open} onClose={() => setOpen(false)} aria-label={ariaLabel}>
          {body}
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
      width="trigger"
    >
      {body}
    </Popover>
  );
}
