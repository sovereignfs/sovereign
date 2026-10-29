import type { ReactNode } from 'react';
import styles from '../(auth)/auth.module.css';

/** The consent page is a sign-in's neighbour and sits the same way. */
export default function ConsentLayout({ children }: { children: ReactNode }) {
  return <div className={styles.stage}>{children}</div>;
}
