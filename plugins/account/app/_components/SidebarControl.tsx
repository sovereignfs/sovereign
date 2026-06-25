'use client';

import { useState, useTransition, useRef } from 'react';
import { Button, Toggle } from '@sovereignfs/ui';
import { updateSidebarPluginsAction } from '../actions';
import styles from '../account.module.css';

interface PluginInfo {
  id: string;
  name: string;
  iconUrl?: string;
}

interface PluginEntry {
  id: string;
  hidden: boolean;
}

interface Props {
  plugins: PluginInfo[];
  initial: PluginEntry[] | null;
}

function monogram(name: string): string {
  const [first = '', second = ''] = name.trim().split(/\s+/);
  return (second ? first.charAt(0) + second.charAt(0) : first.slice(0, 2)).toUpperCase();
}

/**
 * Merge the current saved order with the installed plugin list:
 * - Saved entries appear in their saved order (hidden state preserved)
 * - Newly installed plugins not yet in the saved list are appended, visible
 * - Entries for uninstalled plugins are dropped
 */
function buildEntries(plugins: PluginInfo[], saved: PluginEntry[] | null): PluginEntry[] {
  const installedIds = new Set(plugins.map((p) => p.id));
  if (!saved) return plugins.map((p) => ({ id: p.id, hidden: false }));
  const ordered = saved.filter((e) => installedIds.has(e.id));
  const knownIds = new Set(saved.map((e) => e.id));
  for (const p of plugins) {
    if (!knownIds.has(p.id)) ordered.push({ id: p.id, hidden: false });
  }
  return ordered;
}

export function SidebarControl({ plugins, initial }: Props) {
  const [entries, setEntries] = useState<PluginEntry[]>(() => buildEntries(plugins, initial));
  const [, startTransition] = useTransition();
  const dragIndex = useRef<number | null>(null);

  const infoMap = new Map(plugins.map((p) => [p.id, p]));

  function save(next: PluginEntry[]): void {
    setEntries(next);
    startTransition(() => {
      void updateSidebarPluginsAction(next);
    });
  }

  function toggle(id: string): void {
    save(entries.map((e) => (e.id === id ? { ...e, hidden: !e.hidden } : e)));
  }

  function reset(): void {
    save(plugins.map((p) => ({ id: p.id, hidden: false })));
  }

  // HTML5 Drag-and-Drop handlers
  function onDragStart(index: number): void {
    dragIndex.current = index;
  }

  function onDragOver(e: React.DragEvent, index: number): void {
    e.preventDefault();
    const from = dragIndex.current;
    if (from === null || from === index) return;
    const next = [...entries];
    const moved = next.splice(from, 1)[0];
    if (!moved) return;
    next.splice(index, 0, moved);
    dragIndex.current = index;
    setEntries(next);
  }

  function onDrop(): void {
    dragIndex.current = null;
    startTransition(() => {
      void updateSidebarPluginsAction(entries);
    });
  }

  if (plugins.length === 0) {
    return <p className={styles.help}>No plugins installed.</p>;
  }

  return (
    <div className={styles.sidebarControl}>
      <ul className={styles.sidebarList}>
        {entries.map((entry, index) => {
          const info = infoMap.get(entry.id);
          if (!info) return null;
          return (
            <li
              key={entry.id}
              className={styles.sidebarRow}
              draggable
              onDragStart={() => {
                onDragStart(index);
              }}
              onDragOver={(e) => {
                onDragOver(e, index);
              }}
              onDrop={onDrop}
            >
              <span className={styles.dragHandle} aria-hidden>
                ⠿
              </span>
              <span className={styles.sidebarPluginIcon}>
                {info.iconUrl ? (
                  <img src={info.iconUrl} alt="" aria-hidden className={styles.sidebarPluginImg} />
                ) : (
                  <span aria-hidden>{monogram(info.name)}</span>
                )}
              </span>
              <span className={styles.sidebarPluginName}>{info.name}</span>
              <Toggle
                checked={!entry.hidden}
                onChange={() => toggle(entry.id)}
                aria-label={`Show ${info.name} in sidebar`}
              />
            </li>
          );
        })}
      </ul>
      <Button variant="secondary" onClick={reset}>
        Reset to default
      </Button>
    </div>
  );
}
