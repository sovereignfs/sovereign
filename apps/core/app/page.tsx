import { Card, PageContainer, StatusBadge } from '@sovereignfs/ui';
import styles from './page.module.css';

export default function Page() {
  return (
    <PageContainer maxWidth="sm">
      <Card padding="lg">
        <div className={styles.content}>
          <h1 className={styles.title}>Sovereign Core</h1>
          <p className={styles.text}>
            Core is running. Sign-in and the Console arrive in later releases.
          </p>
          <div>
            <StatusBadge status="synced">Running</StatusBadge>
          </div>
        </div>
      </Card>
    </PageContainer>
  );
}
