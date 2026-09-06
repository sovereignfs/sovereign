'use client';

import type { ChangeEvent, ReactNode } from 'react';
import { Icon } from '@sovereignfs/ui';
import styles from '../console.module.css';

/**
 * The bordered search field Console lists share (Activity, Apps): leading
 * search icon, borderless input, and a muted trailing count. One component
 * so the two pages stop carrying their own copy — Activity's had a
 * hand-drawn SVG, Apps' the DS icon.
 */
export function SearchBar({
  value,
  defaultValue,
  onChange,
  placeholder,
  'aria-label': ariaLabel,
  count,
  className,
}: {
  value?: string;
  defaultValue?: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  placeholder: string;
  'aria-label': string;
  /** e.g. "12 events" or "3 of 9". */
  count?: ReactNode;
  className?: string;
}) {
  return (
    <div className={[styles.searchBar, className].filter(Boolean).join(' ')} role="search">
      <Icon name="search" size="sm" aria-hidden className={styles.searchBarIcon} />
      <input
        type="search"
        placeholder={placeholder}
        value={value}
        defaultValue={defaultValue}
        onChange={onChange}
        className={styles.searchBarInput}
        aria-label={ariaLabel}
      />
      {count !== undefined && <span className={styles.searchBarCount}>{count}</span>}
    </div>
  );
}
