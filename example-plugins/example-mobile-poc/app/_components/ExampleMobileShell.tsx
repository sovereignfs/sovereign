'use client';

import type { ReactNode } from 'react';
import { useIsMobile } from '@sovereignfs/ui';
import SectionsNav from './SectionsNav';
import MobileSectionCarousel from './MobileSectionCarousel';
import styles from '../layout.module.css';

interface Props {
  children: ReactNode;
}

/**
 * Forks the plugin's root shell between the desktop sidebar+content layout
 * and the mobile carousel, same pattern as sovereign-tasks' MobileAwareShell
 * — a client component is required because nothing else in the runtime picks
 * a component tree based on viewport in JS.
 *
 * Unlike sovereign-tasks, `children` (page.tsx's server-rendered output) is
 * only ever used on desktop — the mobile carousel's slides are static and
 * self-contained (see sections.ts), so there is no server-refresh signal to
 * thread through here.
 */
export default function ExampleMobileShell({ children }: Props) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <div className={styles.shell} data-plugin-fullbleed>
        <MobileSectionCarousel />
      </div>
    );
  }

  return (
    <div className={styles.shell} data-plugin-fullbleed>
      <aside className={styles.sidebar}>
        <SectionsNav />
      </aside>
      <main className={styles.content}>{children}</main>
    </div>
  );
}
