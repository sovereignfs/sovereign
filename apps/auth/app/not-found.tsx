import Link from 'next/link';
import styles from './auth.module.css';

export default function NotFound() {
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Page not found</h1>
        <p style={{ marginBottom: 'var(--sv-space-6)', color: 'var(--sv-color-text-muted)' }}>
          The page you&rsquo;re looking for doesn&rsquo;t exist.
        </p>
        <Link className={styles.link} href="/login">
          Back to sign in
        </Link>
      </div>
    </main>
  );
}
