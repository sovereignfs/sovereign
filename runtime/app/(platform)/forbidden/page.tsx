import Link from 'next/link';
import { EmptyState, Button } from '@sovereignfs/ui';
import styles from './forbidden.module.css';

export default function ForbiddenPage() {
  return (
    <div className={styles.page}>
      <EmptyState
        icon="lock"
        heading="You don't have access to this"
        description="Your account doesn't have permission to view this page. If you think this is a mistake, contact your instance admin."
        action={
          <Link href="/">
            <Button>Go home</Button>
          </Link>
        }
      />
    </div>
  );
}
