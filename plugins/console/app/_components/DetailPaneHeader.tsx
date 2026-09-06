'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Icon } from '@sovereignfs/ui';
import { CopyIdButton } from './CopyIdButton';
import styles from '../console.module.css';

/**
 * The header row of every ThreeColumnLayout detail pane — small-caps title,
 * muted subtitle, and a close link that drops the page's selection param
 * (`replace`, so closing doesn't stack history). Users and Groups set the
 * pattern; Apps and External clients used a larger `.detailTitle` and no
 * copyable id until they adopted this.
 */
export function DetailPaneHeader({
  title,
  subtitle,
  closeHref,
  closeLabel,
}: {
  title: string;
  subtitle?: ReactNode;
  closeHref: string;
  /** e.g. "Close user detail" — icon-only control, so this is required. */
  closeLabel: string;
}) {
  return (
    <div className={styles.detailHeader}>
      <div className={styles.detailHeading}>
        <span className={styles.detailTitleLabel}>{title}</span>
        {subtitle && <span className={styles.detailSubtitle}>{subtitle}</span>}
      </div>
      <Link
        replace
        href={closeHref}
        className={styles.iconBtn}
        aria-label={closeLabel}
        title="Close"
      >
        <Icon name="x" size="sm" aria-hidden />
      </Link>
    </div>
  );
}

/** The truncated monospace id with its copy button, directly under the header. */
export function DetailIdRow({ value, label }: { value: string; label: string }) {
  return (
    <span className={styles.userIdRow}>
      <span className={styles.userId} title={value}>
        {value}
      </span>
      <CopyIdButton value={value} label={label} />
    </span>
  );
}

/** A titled block inside the pane — hairline-separated, `h3` heading. */
export function DetailSection({
  title,
  children,
  description,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={styles.detailSection}>
      <h3 className={styles.detailSectionTitle}>{title}</h3>
      {description && <p className={styles.helpText}>{description}</p>}
      {children}
    </section>
  );
}
