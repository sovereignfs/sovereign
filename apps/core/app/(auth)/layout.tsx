import type { ReactNode } from 'react';
import styles from './auth.module.css';

/** The pages a person meets before signing in: a card a little below the top of the screen, not hard against it. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return <div className={styles.stage}>{children}</div>;
}
