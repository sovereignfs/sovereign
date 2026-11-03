import type { ReactNode } from 'react';
import styles from './Auth.module.css';

/**
 * The frame of every page that stands alone before (or beside) signing in: one card, centred on the screen.
 * It draws nothing of its own but the card, so a page that cannot read the instance, such as an error page,
 * can use it too. `wide` is for a page that shows more than a form, such as a shared document.
 */
export function AuthShell({ wide = false, children }: { wide?: boolean; children: ReactNode }) {
  return (
    <main className={styles.page}>
      <div className={wide ? `${styles.card} ${styles.wide}` : styles.card}>{children}</div>
    </main>
  );
}
