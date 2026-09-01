'use client';

import Link from 'next/link';
import { Icon } from '@sovereignfs/ui';
import { GroupDetailFields } from './GroupDetailFields';
import { CopyIdButton } from '../_components/CopyIdButton';
import styles from '../console.module.css';

interface GroupSummary {
  id: string;
  name: string;
  slug: string;
  description: string | null;
}

/**
 * Desktop `ThreeColumnLayout` detail column for a selected group —
 * consolidates the details form, member list/picker, and danger zone that
 * used to live behind `ManageGroupDialog`'s dialog. Rendered via
 * `ConsoleDetailSlot` from `groups/page.tsx`; `closeHref` drops the
 * `?group=` param. Mirrors workstream 0022 leg 2's `UserDetailPane`.
 */
export function GroupDetailPane({ group, closeHref }: { group: GroupSummary; closeHref: string }) {
  return (
    <div className={styles.detailPane}>
      <div className={styles.detailHeader}>
        <div className={styles.detailHeading}>
          <span className={styles.detailTitleLabel}>{group.name}</span>
          <span className={styles.detailSubtitle}>
            {group.description ?? `Slug: ${group.slug}`}
          </span>
        </div>
        <Link
          replace
          href={closeHref}
          className={styles.iconBtn}
          aria-label="Close group detail"
          title="Close"
        >
          <Icon name="x" size="sm" aria-hidden />
        </Link>
      </div>

      <span className={styles.userIdRow}>
        <span className={styles.userId} title={group.id}>
          {group.id}
        </span>
        <CopyIdButton value={group.id} label="Copy group ID" />
      </span>

      <GroupDetailFields group={group} />
    </div>
  );
}
