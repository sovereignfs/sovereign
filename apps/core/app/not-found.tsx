import Link from 'next/link';
import { ButtonLink, Card, PageContainer } from '@sovereignfs/ui';
import styles from './(auth)/auth.module.css';

/** Any address that leads nowhere, and every Console page someone may not open (which look the same on purpose). */
export default function NotFound() {
  return (
    <PageContainer maxWidth="sm">
      <div className={styles.stage}>
        <Card padding="lg">
          <div className={styles.form}>
            <h1 className={styles.title}>This page is not here</h1>
            <p className={styles.lead}>
              The address may be wrong, or the page may have moved. Nothing is lost.
            </p>
            <div>
              <ButtonLink href="/" renderLink={(props) => <Link {...props} />}>
                Go to the start
              </ButtonLink>
            </div>
          </div>
        </Card>
      </div>
    </PageContainer>
  );
}
