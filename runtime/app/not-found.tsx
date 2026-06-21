import Link from 'next/link';
import styles from './_error.module.css';

export default function NotFound() {
  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.code}>404</h1>
        <p className={styles.message}>This page could not be found.</p>
        <Link href="/" className={styles.link}>
          Go home
        </Link>
      </div>
    </div>
  );
}
