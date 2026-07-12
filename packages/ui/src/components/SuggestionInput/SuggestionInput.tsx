'use client';

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Popover } from '../Popover/Popover';
import styles from './SuggestionInput.module.css';

export interface SuggestionOption {
  id: string;
  label: string;
  icon?: ReactNode;
  /** Secondary text shown right-aligned on the row, e.g. "bought 4× recently". */
  meta?: string;
}

export interface SuggestionInputProps {
  value: string;
  onChange: (value: string) => void;
  options: SuggestionOption[];
  onSelect: (option: SuggestionOption) => void;
  placeholder?: string;
  'aria-label': string;
  id?: string;
  disabled?: boolean;
  /** Shown in place of the options list while a suggestion fetch is in flight. */
  loading?: boolean;
  /**
   * Label for a trailing, always-selectable row that commits the raw typed
   * text instead of a matched option — e.g. `(v) => \`Add "${v}" as a new item\`}`.
   * Shown whenever `value` is non-empty and `onCreate` is provided, even
   * when `options` is empty, so the input is never a dead end.
   */
  createLabel?: (value: string) => string;
  onCreate?: (value: string) => void;
  className?: string;
}

/**
 * SuggestionInput — a text field with an anchored, keyboard-navigable list
 * of async suggestions (a combobox), plus an optional trailing "create new"
 * row so free text is always a valid commit, not just a matched option.
 *
 * Fully controlled: the caller owns `value`/`onChange` and supplies
 * `options` (e.g. debounced server-fetched results) — this component only
 * handles open/close, keyboard navigation, and selection. Built on `Popover`
 * for positioning (`width: 'trigger'`, so the panel always matches the
 * input's own width).
 */
export function SuggestionInput({
  value,
  onChange,
  options,
  onSelect,
  placeholder,
  'aria-label': ariaLabel,
  id,
  disabled = false,
  loading = false,
  createLabel,
  onCreate,
  className,
}: SuggestionInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const listId = `${inputId}-suggestions`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const showCreateRow = Boolean(onCreate && createLabel && value.trim());
  const rowCount = options.length + (showCreateRow ? 1 : 0);
  const open = focused && (rowCount > 0 || loading);

  function close() {
    setFocused(false);
    setActiveIndex(-1);
  }

  function commitIndex(index: number) {
    if (index < 0 || index >= rowCount) return;
    const option = options[index];
    if (option) {
      onSelect(option);
    } else if (onCreate) {
      onCreate(value);
    }
    close();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % rowCount);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? rowCount - 1 : i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      commitIndex(activeIndex === -1 ? 0 : activeIndex);
    } else if (e.key === 'Escape') {
      close();
    }
  }

  const trigger = (
    <input
      ref={inputRef}
      id={inputId}
      type="text"
      role="combobox"
      aria-expanded={open}
      aria-controls={listId}
      aria-autocomplete="list"
      aria-activedescendant={activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined}
      aria-label={ariaLabel}
      className={[styles.input, className].filter(Boolean).join(' ')}
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      autoComplete="off"
      onChange={(e) => {
        onChange(e.target.value);
        setActiveIndex(-1);
      }}
      onFocus={() => setFocused(true)}
      onKeyDown={handleKeyDown}
    />
  );

  return (
    <Popover
      trigger={trigger}
      open={open}
      onClose={close}
      width="trigger"
      aria-label={`${ariaLabel} suggestions`}
    >
      <ul id={listId} role="listbox" className={styles.list}>
        {loading ? (
          <li className={styles.status}>Loading…</li>
        ) : (
          <>
            {options.map((option, index) => (
              <li key={option.id} role="none">
                <button
                  id={`${listId}-option-${index}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  type="button"
                  className={[styles.option, index === activeIndex ? styles.optionActive : '']
                    .filter(Boolean)
                    .join(' ')}
                  // Selecting via mouse fires before the input's blur — use
                  // onMouseDown (not onClick) so the click doesn't lose focus
                  // and close the popover before the selection registers.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    commitIndex(index);
                  }}
                >
                  {option.icon && <span className={styles.optionIcon}>{option.icon}</span>}
                  <span className={styles.optionLabel}>{option.label}</span>
                  {option.meta && <span className={styles.optionMeta}>{option.meta}</span>}
                </button>
              </li>
            ))}
            {showCreateRow && createLabel && (
              <li role="none">
                {options.length > 0 && <div className={styles.divider} />}
                <button
                  id={`${listId}-option-${options.length}`}
                  role="option"
                  aria-selected={options.length === activeIndex}
                  type="button"
                  className={[
                    styles.option,
                    styles.optionCreate,
                    options.length === activeIndex ? styles.optionActive : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    commitIndex(options.length);
                  }}
                >
                  {createLabel(value)}
                </button>
              </li>
            )}
          </>
        )}
      </ul>
    </Popover>
  );
}
