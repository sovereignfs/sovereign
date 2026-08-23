'use client';

import Link from 'next/link';
import { Icon, HeaderFooterLayout } from '@sovereignfs/ui';
import styles from './HeaderFooterDemo.module.css';

// Stand-in content — this plugin is a layout showcase, not a data app, so
// there is deliberately no fetch, no SDK call, no persistence here.
const ROWS = Array.from({ length: 40 }, (_, index) => `Row ${index + 1}`);

export function HeaderFooterDemo() {
  return (
    <div className={styles.frame} data-plugin-fullbleed>
      <HeaderFooterLayout
        header={
          <div className={styles.header}>
            <Link href="/example-layouts" className={styles.backLink}>
              <Icon name="chevron-left" size="sm" aria-hidden />
              Layouts
            </Link>
            <span className={styles.headerTitle}>HeaderFooterLayout</span>
          </div>
        }
        footer={
          <div className={styles.footer}>
            <button type="button" className={styles.footerBtn}>
              <Icon name="house" size="sm" aria-hidden />
              Home
            </button>
            <button type="button" className={styles.footerBtn}>
              <Icon name="layers" size="sm" aria-hidden />
              Apps
            </button>
            <button type="button" className={styles.footerBtn}>
              <Icon name="search" size="sm" aria-hidden />
              Search
            </button>
          </div>
        }
      >
        <ul className={styles.list}>
          {ROWS.map((row) => (
            <li key={row} className={styles.row}>
              {row}
            </li>
          ))}
        </ul>
      </HeaderFooterLayout>
    </div>
  );
}
