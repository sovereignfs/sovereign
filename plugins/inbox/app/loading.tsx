import { PageContainer, Spinner } from '@sovereignfs/ui';
import styles from './loading.module.css';

/**
 * Covers the tabbed inbox home, a single notification, and a single
 * message — all three await a session/data fetch and all three use
 * `PageContainer maxWidth="md"`, so this matches their width.
 */
export default function InboxLoading() {
  return (
    <PageContainer maxWidth="md">
      <div className={styles.root} role="status" aria-live="polite">
        <Spinner />
        <span>Loading…</span>
      </div>
    </PageContainer>
  );
}
