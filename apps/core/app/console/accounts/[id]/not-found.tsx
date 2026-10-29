import Link from 'next/link';
import styles from '../accounts.module.css';

export default function AccountNotFound() {
  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>There is no such account</h1>
      <p className={styles.lead}>It may have been deleted.</p>
      <Link className={styles.back} href="/console/accounts">
        ‹ Accounts
      </Link>
    </div>
  );
}
