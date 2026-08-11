import Link from 'next/link';
import { EmptyState, Button } from '@sovereignfs/ui';
import styles from './unavailable-surface.module.css';

export default function UnavailableSurfacePage() {
  return (
    <div className={styles.page}>
      <EmptyState
        icon="info"
        heading="Not available on this device"
        description="This app isn't available on the device or app you're currently using. Try opening it from a different device."
        action={
          <Link href="/">
            <Button>Go home</Button>
          </Link>
        }
      />
    </div>
  );
}
