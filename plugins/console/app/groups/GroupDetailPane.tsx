'use client';

import { GroupDetailFields } from './GroupDetailFields';
import { DetailIdRow, DetailPaneHeader } from '../_components/DetailPaneHeader';
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
 * `?group=` param. Mirrors `UserDetailPane`.
 */
export function GroupDetailPane({ group, closeHref }: { group: GroupSummary; closeHref: string }) {
  return (
    <div className={styles.detailPane}>
      <DetailPaneHeader
        title={group.name}
        subtitle={group.description ?? `Slug: ${group.slug}`}
        closeHref={closeHref}
        closeLabel="Close group detail"
      />
      <DetailIdRow value={group.id} label="Copy group ID" />
      <GroupDetailFields group={group} />
    </div>
  );
}
