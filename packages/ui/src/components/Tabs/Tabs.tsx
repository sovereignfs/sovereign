'use client';

import styles from './Tabs.module.css';

export interface TabItem {
  label: string;
  value: string;
}

export interface TabsProps {
  items: TabItem[];
  value: string;
  onChange: (value: string) => void;
  'aria-label': string;
}

/**
 * Tabs — underline tab nav for section switching.
 *
 * Stateless: the active tab is fully controlled via `value` + `onChange`, so the
 * caller owns state and controls the rendered panel content. This keeps the
 * component RSC-compatible when wrapped by a client boundary upstream.
 *
 * Mobile: the tab bar scrolls horizontally with the native scrollbar hidden.
 */
export function Tabs({ items, value, onChange, 'aria-label': ariaLabel }: TabsProps) {
  return (
    <div role="tablist" aria-label={ariaLabel} className={styles.tablist}>
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            className={[styles.tab, active ? styles.active : styles.inactive].join(' ')}
            onClick={() => onChange(item.value)}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
