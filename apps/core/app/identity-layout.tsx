import type { ReactNode } from 'react';
import { PageContainer } from '@sovereignfs/ui';
import { IdentityNav } from './identity-nav';
import styles from './identity-layout.module.css';

/**
 * The frame the identity pages share (core-app §3.11): a heading, the pages a person can go between, and
 * the page. They are meant to open as an overlay above the page the person was on, which needs the
 * signed-in shell; until that exists they are pages of their own, and this is the one place that will
 * change when they are not.
 */
export default function IdentityLayout({ children }: { children: ReactNode }) {
  return (
    <PageContainer maxWidth="md">
      <div className={styles.frame}>
        <p className={styles.heading}>Your account</p>
        <IdentityNav />
        {children}
      </div>
    </PageContainer>
  );
}
