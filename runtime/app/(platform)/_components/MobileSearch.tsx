'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@sovereignfs/ui';
import styles from './MobileSearch.module.css';

interface PluginEntry {
  id: string;
  name: string;
  routePrefix: string;
  iconUrl?: string;
}

function monogram(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '';
  const [first = '', second = ''] = trimmed.split(/\s+/);
  const initials = second ? first.charAt(0) + second.charAt(0) : first.slice(0, 2);
  return initials.toUpperCase();
}

export function MobileSearch({
  open,
  onClose,
  plugins,
}: {
  open: boolean;
  onClose: () => void;
  plugins: PluginEntry[];
}) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus input when overlay opens; clear query on close.
  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    } else {
      setQuery('');
    }
  }, [open]);

  // Scroll lock while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Esc key dismisses.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const q = query.trim().toLowerCase();
  const results = q ? plugins.filter((p) => p.name.toLowerCase().includes(q)) : plugins;

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Search plugins">
      <div className={styles.header}>
        <button
          type="button"
          className={styles.backButton}
          aria-label="Close search"
          onClick={onClose}
        >
          <Icon name="chevron-left" size="md" aria-hidden />
        </button>
        <span className={styles.title}>Search</span>
      </div>

      <div className={styles.inputWrapper}>
        <input
          ref={inputRef}
          type="search"
          placeholder="Search plugins…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search plugins"
          className={styles.searchInput}
        />
      </div>

      <div className={styles.results}>
        {results.length === 0 ? (
          <p className={styles.empty}>No plugins found</p>
        ) : (
          <ul className={styles.resultList}>
            {results.map((plugin) => (
              <li key={plugin.id}>
                <Link href={plugin.routePrefix} className={styles.resultItem} onClick={onClose}>
                  <span className={styles.pluginIcon} aria-hidden="true">
                    {plugin.iconUrl ? (
                      <img src={plugin.iconUrl} alt="" className={styles.pluginIconImg} />
                    ) : (
                      monogram(plugin.name)
                    )}
                  </span>
                  <span className={styles.pluginName}>{plugin.name}</span>
                  <Icon name="chevron-right" size="sm" aria-hidden className={styles.chevron} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
