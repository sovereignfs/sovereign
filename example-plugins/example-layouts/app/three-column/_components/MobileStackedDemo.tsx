'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Icon } from '@sovereignfs/ui';
import { ITEMS, LISTS } from '../_lib/demoData';
import styles from './MobileStackedDemo.module.css';

type Step =
  | { kind: 'lists' }
  | { kind: 'items'; listId: string }
  | { kind: 'detail'; listId: string; itemId: string };

/**
 * Mobile half of the ResponsiveSurface fork in LayoutDemo.tsx.
 *
 * ThreeColumnLayout deliberately has no responsive behavior of its own —
 * fitting sidebarWidth + detailWidth (240 + 340 here) on a phone-width
 * screen isn't something the layout primitive can solve by squeezing
 * itself, so the plugin owning this content picks a completely different
 * presentation instead: one full-width pane at a time, with drill-down
 * navigation (lists → items → detail) replacing side-by-side columns. Same
 * underlying data and state shape as ThreeColumnDemo, just a different
 * shell around it — this is the composition pattern this plugin exists to
 * demonstrate, not a new layout primitive of its own.
 */
export function MobileStackedDemo() {
  const [step, setStep] = useState<Step>({ kind: 'lists' });

  if (step.kind === 'lists') {
    return (
      <div className={styles.screen}>
        <div className={styles.header}>
          <Link href="/example-layouts" className={styles.backLink}>
            <Icon name="chevron-left" size="sm" aria-hidden />
            Layouts
          </Link>
        </div>
        <ul className={styles.list}>
          {LISTS.map((list) => (
            <li key={list.id}>
              <button
                type="button"
                className={styles.rowBtn}
                onClick={() => setStep({ kind: 'items', listId: list.id })}
              >
                {list.name}
                <Icon name="chevron-right" size="sm" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const list = LISTS.find((l) => l.id === step.listId);
  const items = ITEMS.filter((item) => item.listId === step.listId);

  if (step.kind === 'items') {
    return (
      <div className={styles.screen}>
        <div className={styles.header}>
          <button
            type="button"
            className={styles.backLink}
            onClick={() => setStep({ kind: 'lists' })}
          >
            <Icon name="chevron-left" size="sm" aria-hidden />
            Lists
          </button>
        </div>
        <h1 className={styles.title}>{list?.name}</h1>
        {items.length === 0 ? (
          <p className={styles.empty}>No items in this list.</p>
        ) : (
          <ul className={styles.list}>
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={styles.rowBtn}
                  onClick={() => setStep({ kind: 'detail', listId: step.listId, itemId: item.id })}
                >
                  {item.title}
                  <Icon name="chevron-right" size="sm" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const item = items.find((i) => i.id === step.itemId);

  return (
    <div className={styles.screen}>
      <div className={styles.header}>
        <button
          type="button"
          className={styles.backLink}
          onClick={() => setStep({ kind: 'items', listId: step.listId })}
        >
          <Icon name="chevron-left" size="sm" aria-hidden />
          {list?.name}
        </button>
      </div>
      <h1 className={styles.title}>{item?.title}</h1>
      <p className={styles.notes}>{item?.notes || 'No notes.'}</p>
    </div>
  );
}
