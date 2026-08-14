'use client';

import { useState } from 'react';
import { EmptyState } from '@sovereignfs/ui';
import { PluginGrid } from './PluginGrid';
import type { PluginTileData } from './PluginTile';
import styles from '../launcher.module.css';

export function SearchableGrid({ plugins, total }: { plugins: PluginTileData[]; total: number }) {
  const [query, setQuery] = useState('');
  const trimmedQuery = query.trim();

  const filtered = trimmedQuery
    ? plugins.filter(
        (p) =>
          p.name.toLowerCase().includes(trimmedQuery.toLowerCase()) ||
          p.description.toLowerCase().includes(trimmedQuery.toLowerCase()),
      )
    : plugins;

  return (
    <>
      <div className={styles.header}>
        <h1 className={styles.title}>Home</h1>
        <p className={styles.subtitle}>Your installed apps and tools.</p>
        <label className={styles.searchWrap} aria-label="Search apps">
          <svg className={styles.searchIcon} viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M10 10l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            className={styles.searchInput}
            placeholder="Search apps"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>

      <div className={styles.sectionRow}>
        <span className={styles.sectionLabel}>APPS</span>
        <span className={styles.sectionCount}>{total} installed</span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon="search"
          heading={`No apps match "${trimmedQuery}"`}
          description="Try a different keyword."
        />
      ) : (
        <PluginGrid plugins={filtered} />
      )}
    </>
  );
}
