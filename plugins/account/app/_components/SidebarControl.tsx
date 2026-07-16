'use client';

import { DndContext, closestCenter } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useState, useTransition } from 'react';
import { Button, Toggle } from '@sovereignfs/ui';
import { updateSidebarPluginsAction } from '../actions';
import { useReorderSensors } from '../_lib/dndSensors';
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
  // MouseSensor (handle-initiated, desktop) + TouchSensor (long-press lift,
  // mobile — fixes reordering being unusable on iOS PWA/Safari, which never
  // implements the native HTML5 Drag-and-Drop API for touch) + KeyboardSensor.
  // See _lib/dndSensors.ts.
  const sensors = useReorderSensors();

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

  function handleDragEnd(event: DragEndEvent): void {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = entries.findIndex((e) => e.id === active.id);
    const newIndex = entries.findIndex((e) => e.id === over.id);
    save(arrayMove(entries, oldIndex, newIndex));
  }

  if (plugins.length === 0) {
    return <p className={styles.help}>No plugins installed.</p>;
  }

  return (
    <div className={styles.sidebarControl}>
      <DndContext
        id="sidebar-plugins-dnd"
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={entries.map((e) => e.id)} strategy={verticalListSortingStrategy}>
          <ul className={styles.sidebarList}>
            {entries.map((entry) => {
              const info = infoMap.get(entry.id);
              if (!info) return null;
              return (
                <SidebarRow
                  key={entry.id}
                  entry={entry}
                  info={info}
                  onToggle={() => toggle(entry.id)}
                />
              );
            })}
          </ul>
        </SortableContext>
      </DndContext>
      <Button variant="secondary" onClick={reset}>
        Reset to default
      </Button>
    </div>
  );
}

function SidebarRow({
  entry,
  info,
  onToggle,
}: {
  entry: PluginEntry;
  info: PluginInfo;
  onToggle: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.id,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={[styles.sidebarRow, isDragging ? styles.sidebarRowDragging : '']
        .filter(Boolean)
        .join(' ')}
    >
      <button
        type="button"
        className={styles.dragHandle}
        aria-label={`Drag to reorder ${info.name}`}
        {...attributes}
        {...listeners}
      >
        ⠿
      </button>
      <span className={styles.sidebarPluginIcon}>
        {info.iconUrl ? (
          <img src={info.iconUrl} alt="" aria-hidden className={styles.sidebarPluginImg} />
        ) : (
          <span aria-hidden>{monogram(info.name)}</span>
        )}
      </span>
      <span className={styles.sidebarPluginName}>{info.name}</span>
      <span data-no-dnd>
        <Toggle
          checked={!entry.hidden}
          onChange={onToggle}
          aria-label={`Show ${info.name} in sidebar`}
        />
      </span>
    </li>
  );
}
