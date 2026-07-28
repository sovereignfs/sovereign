'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Dialog } from '../Dialog/Dialog';
import { Icon, type IconName } from '../Icon/Icon';
import styles from './Command.module.css';

export interface CommandItem {
  id: string;
  label: string;
  onSelect: () => void;
  icon?: IconName;
  /** Section header this item is grouped under. */
  group?: string;
  /** Extra searchable text beyond the label (keywords, description). */
  keywords?: string;
}

export interface CommandProps {
  open: boolean;
  onClose: () => void;
  items: CommandItem[];
  placeholder?: string;
  'aria-label'?: string;
}

/** Case-insensitive substring match against label + keywords. Not a scored
 * fuzzy matcher — a real fuzzy-match algorithm is a meaningfully bigger
 * undertaking than this primitive needs until a consumer's command list
 * is large enough that substring filtering stops being good enough. */
function matches(item: CommandItem, query: string): boolean {
  if (!query) return true;
  const haystack = `${item.label} ${item.keywords ?? ''}`.toLowerCase();
  return haystack.includes(query.toLowerCase());
}

/**
 * Command — a ⌘K-style palette. Opened via `Dialog`, which supplies the
 * modal shell (scrim, panel, mobile full-screen sheet, focus handling) —
 * this only adds the search input, filtering, and arrow-key/Enter
 * selection on top of it. Controlled (`open`/`onClose`): the consumer wires
 * up their own global shortcut listener to flip `open` — a DS primitive
 * shouldn't own a document-level keydown listener itself.
 */
export function Command({
  open,
  onClose,
  items,
  placeholder = 'Type a command…',
  'aria-label': ariaLabel = 'Command palette',
}: CommandProps) {
  const [query, setQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const filtered = useMemo(() => items.filter((item) => matches(item, query)), [items, query]);

  // Reset on every open, and whenever the query narrows/widens the result
  // set — the top match should always be the one Enter would select.
  useEffect(() => {
    setHighlightedIndex(0);
  }, [query, open]);

  useEffect(() => {
    if (open) {
      setQuery('');
      // Dialog mounts its content in the same tick it flips `open`; focus
      // needs the next paint to land on an element that actually exists.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  function handleKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = filtered[highlightedIndex];
      if (item) {
        onClose();
        item.onSelect();
      }
    }
  }

  // Group items in their original order, without moving an item's position
  // relative to its own group even if groups aren't contiguous in `items`.
  const groups = useMemo(() => {
    const order: (string | undefined)[] = [];
    const byGroup = new Map<string | undefined, CommandItem[]>();
    for (const item of filtered) {
      let bucket = byGroup.get(item.group);
      if (!bucket) {
        bucket = [];
        order.push(item.group);
        byGroup.set(item.group, bucket);
      }
      bucket.push(item);
    }
    return order.map((group) => ({ group, items: byGroup.get(group) ?? [] }));
  }, [filtered]);

  const highlightedId = filtered[highlightedIndex]
    ? `${listId}-${filtered[highlightedIndex].id}`
    : undefined;

  return (
    <Dialog open={open} onClose={onClose} aria-label={ariaLabel} size="sm">
      <div className={styles.root}>
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={filtered.length > 0}
          aria-controls={listId}
          aria-activedescendant={highlightedId}
          aria-autocomplete="list"
          className={styles.input}
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <ul id={listId} role="listbox" className={styles.list}>
          {filtered.length === 0 && <li className={styles.empty}>No matching commands.</li>}
          {groups.map(({ group, items: groupItems }) => (
            <li key={group ?? '__ungrouped'}>
              {group && <div className={styles.groupLabel}>{group}</div>}
              <ul className={styles.groupList}>
                {groupItems.map((item) => {
                  const index = filtered.indexOf(item);
                  const isHighlighted = index === highlightedIndex;
                  return (
                    <li key={item.id}>
                      <button
                        id={`${listId}-${item.id}`}
                        type="button"
                        role="option"
                        aria-selected={isHighlighted}
                        className={[styles.item, isHighlighted ? styles.itemHighlighted : '']
                          .filter(Boolean)
                          .join(' ')}
                        onMouseEnter={() => setHighlightedIndex(index)}
                        onClick={() => {
                          onClose();
                          item.onSelect();
                        }}
                      >
                        {item.icon && <Icon name={item.icon} size="sm" aria-hidden />}
                        {item.label}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </Dialog>
  );
}
