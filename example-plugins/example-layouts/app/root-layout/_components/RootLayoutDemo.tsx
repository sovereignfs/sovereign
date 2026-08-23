'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Icon, RootLayout } from '@sovereignfs/ui';
import type { RootLayoutVariant } from '@sovereignfs/ui';
import styles from './RootLayoutDemo.module.css';

const VARIANTS: { value: RootLayoutVariant; label: string; note: string }[] = [
  { value: 'plain', label: 'plain', note: 'No chrome on either breakpoint.' },
  {
    value: 'sidebar',
    label: 'sidebar',
    note: 'Sidebar + main on web. On mobile, sidebar is dropped — main only.',
  },
  { value: 'header', label: 'header', note: 'Header + main, identical on both breakpoints.' },
  {
    value: 'shell',
    label: 'shell',
    note: 'Main only on web. On mobile, header + main + footer.',
  },
];

function Block({ label }: { label: string }) {
  return <div className={styles.block}>{label}</div>;
}

export function RootLayoutDemo() {
  const [variant, setVariant] = useState<RootLayoutVariant>('sidebar');
  const active = VARIANTS.find((v) => v.value === variant);

  return (
    <div className={styles.frame} data-plugin-fullbleed>
      <div className={styles.controls}>
        <Link href="/example-layouts" className={styles.backLink}>
          <Icon name="chevron-left" size="sm" aria-hidden />
          Layouts
        </Link>
        <div className={styles.variantButtons}>
          {VARIANTS.map((v) => (
            <button
              key={v.value}
              type="button"
              className={v.value === variant ? `${styles.btn} ${styles.btnActive}` : styles.btn}
              onClick={() => setVariant(v.value)}
            >
              {v.label}
            </button>
          ))}
        </div>
        <p className={styles.note}>{active?.note} Resize the browser below 768px to see it.</p>
      </div>

      <div className={styles.preview}>
        {variant === 'plain' && (
          <RootLayout variant="plain">
            <Block label="Main" />
          </RootLayout>
        )}
        {variant === 'sidebar' && (
          <RootLayout variant="sidebar">
            <Block label="Sidebar" />
            <Block label="Main" />
          </RootLayout>
        )}
        {variant === 'header' && (
          <RootLayout variant="header">
            <Block label="Header" />
            <Block label="Main" />
          </RootLayout>
        )}
        {variant === 'shell' && (
          <RootLayout variant="shell">
            <Block label="Header (mobile only)" />
            <Block label="Main" />
            <Block label="Footer (mobile only)" />
          </RootLayout>
        )}
      </div>
    </div>
  );
}
