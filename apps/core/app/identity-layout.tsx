import type { ReactNode } from 'react';
import { InstallPrompt, PageContainer } from '@sovereignfs/ui';
import { getInstanceIdentity } from '../src/instance/service';
import { AccountHeader } from './account-header';
import { IdentityNav } from './identity-nav';
import styles from './identity-layout.module.css';

/**
 * The frame the identity pages share (core-app §3.11): a heading, the pages a person can go between, and
 * the page. They are meant to open as an overlay above the page the person was on, which needs the
 * signed-in shell; until that exists they are pages of their own, and this is the one place that will
 * change when they are not. Where the device allows it, they also offer to install core as an app (RFC 0001 A2);
 * the offer is decided on the device, so the page is the same for everyone.
 */
export default async function IdentityLayout({ children }: { children: ReactNode }) {
  const { name } = await getInstanceIdentity();
  return (
    <PageContainer maxWidth="md">
      <div className={styles.frame}>
        <AccountHeader />
        <p className={styles.heading}>Your account</p>
        <IdentityNav />
        <InstallPrompt appName={name} />
        {children}
      </div>
    </PageContainer>
  );
}
