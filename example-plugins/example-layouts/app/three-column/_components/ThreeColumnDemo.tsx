'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Icon, ThreeColumnLayout } from '@sovereignfs/ui';
import { ITEMS, LISTS } from '../_lib/demoData';
import styles from './ThreeColumnDemo.module.css';

/**
 * Desktop half of the ResponsiveSurface fork in LayoutDemo.tsx.
 * ThreeColumnLayout has no responsive behavior of its own — see that
 * component's own doc comment — so this tree is only ever mounted at web
 * widths; MobileStackedDemo.tsx is what renders below the breakpoint.
 */
export function ThreeColumnDemo() {
  const [activeListId, setActiveListId] = useState(LISTS[0]?.id ?? 'groceries');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  const items = ITEMS.filter((item) => item.listId === activeListId);
  const selectedItem = items.find((item) => item.id === selectedItemId) ?? null;

  return (
    <div className={styles.frame} data-plugin-fullbleed>
      <ThreeColumnLayout sidebarWidth={240} detailWidth={340}>
        {/* Sidebar — fixed width, always present. Any content works here;
            ThreeColumnLayout has no idea this is a list-of-lists nav. */}
        <nav className={styles.sidebar} aria-label="Lists">
          <div className={styles.sidebarHeader}>
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
                  className={
                    list.id === activeListId
                      ? `${styles.listBtn} ${styles.listBtnActive}`
                      : styles.listBtn
                  }
                  onClick={() => {
                    setActiveListId(list.id);
                    setSelectedItemId(null);
                  }}
                >
                  {list.name}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* Main — always present, fills whatever width isn't claimed by
            sidebar/detail. */}
        <div className={styles.main}>
          <h1 className={styles.mainTitle}>{LISTS.find((l) => l.id === activeListId)?.name}</h1>
          {items.length === 0 ? (
            <p className={styles.empty}>No items in this list.</p>
          ) : (
            <ul className={styles.list}>
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={
                      item.id === selectedItemId
                        ? `${styles.itemBtn} ${styles.itemBtnActive}`
                        : styles.itemBtn
                    }
                    onClick={() => setSelectedItemId(item.id)}
                  >
                    {item.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Detail — the whole point of this demo: omitted entirely (not
            just hidden) whenever nothing is selected, so main reclaims the
            full remaining width instead of the third column sitting there
            empty. */}
        {selectedItem && (
          <div className={styles.detail}>
            <div className={styles.detailHeader}>
              <h2 className={styles.detailTitle}>{selectedItem.title}</h2>
              <button
                type="button"
                className={styles.closeBtn}
                aria-label="Close detail"
                onClick={() => setSelectedItemId(null)}
              >
                <Icon name="x" size="sm" aria-hidden />
              </button>
            </div>
            <p className={styles.detailNotes}>{selectedItem.notes || 'No notes.'}</p>
          </div>
        )}
      </ThreeColumnLayout>
    </div>
  );
}
