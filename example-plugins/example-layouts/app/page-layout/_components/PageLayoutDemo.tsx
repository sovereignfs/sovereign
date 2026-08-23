'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Icon, PageLayout, RootLayout } from '@sovereignfs/ui';
import type { PageLayoutPadding } from '@sovereignfs/ui';
import styles from './PageLayoutDemo.module.css';

const PADDINGS: PageLayoutPadding[] = ['none', 'sm', 'md', 'lg'];

export function PageLayoutDemo() {
  const [padding, setPadding] = useState<PageLayoutPadding>('md');

  return (
    <div className={styles.frame} data-plugin-fullbleed>
      <RootLayout variant="sidebar">
        <nav className={styles.sidebar} aria-label="Example nav">
          <Link href="/example-layouts" className={styles.sidebarLink} aria-label="Back to Layouts">
            <Icon name="layout-dashboard" size="md" aria-hidden />
          </Link>
        </nav>
        <PageLayout
          padding={padding}
          header={
            <div className={styles.pageHeader}>
              <span className={styles.pageTitle}>Sv Wallet</span>
              <div className={styles.paddingButtons}>
                {PADDINGS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={p === padding ? `${styles.btn} ${styles.btnActive}` : styles.btn}
                    onClick={() => setPadding(p)}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          }
        >
          <div className={styles.content}>
            <p className={styles.note}>
              padding=&quot;{padding}&quot; — this row and the ones below sit inside
              PageLayout&apos;s padded content region. The header above stays edge-to-edge, outside
              the padding.
            </p>
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className={styles.card}>
                Card {i + 1}
              </div>
            ))}
          </div>
        </PageLayout>
      </RootLayout>
    </div>
  );
}
