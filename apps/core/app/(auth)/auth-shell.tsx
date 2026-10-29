import type { ReactNode } from 'react';
import styles from './auth.module.css';

/**
 * The frame of every page that stands alone before (or beside) signing in: one card, centred on the screen
 * (core-app §1.3). It draws nothing of its own but the card, so a page that cannot read the instance, such
 * as an error page, can use it too.
 */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className={styles.page}>
      <div className={styles.card}>{children}</div>
    </main>
  );
}
