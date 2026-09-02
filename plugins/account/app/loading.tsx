import { Spinner } from '@sovereignfs/ui';
import styles from './loading.module.css';

export default function AccountLoading() {
  return (
    <div className={styles.loading}>
      <Spinner size="md" label="Loading Account…" />
    </div>
  );
}
