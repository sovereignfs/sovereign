import Link from 'next/link';
import { Icon } from '@sovereignfs/ui';
import { sdk } from '@sovereignfs/sdk';
import { ManageGroupDialog } from './ManageGroupDialog';
import { CreateGroupDialog } from './CreateGroupDialog';
import { GroupDetailPane } from './GroupDetailPane';
import { ConsoleDetailSlot } from '../_components/ConsoleDetailSlot';
import { ConsolePageHeader } from '../_components/ConsolePageHeader';
import styles from '../console.module.css';
import { renderFetchSignal } from '../_lib/fetch-timeout';

interface GroupRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: number;
  memberCount: number;
}

function memberCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'member' : 'members'}`;
}

async function getGroups(): Promise<GroupRow[]> {
  const selfUrl = `http://localhost:${process.env.RUNTIME_PORT ?? '3000'}`;
  const adminKey = process.env.SOVEREIGN_ADMIN_KEY ?? '';
  try {
    const res = await fetch(`${selfUrl}/api/admin/groups`, {
      headers: { Authorization: `Bearer ${adminKey}` },
      cache: 'no-store',
      signal: renderFetchSignal(),
    });
    if (!res.ok) {
      console.error(`[groups] fetch failed: ${res.status}`);
      return [];
    }
    return res.json() as Promise<GroupRow[]>;
  } catch (err) {
    console.error('[groups] fetch error:', err instanceof Error ? err.message : err);
    return [];
  }
}

export default async function GroupsPage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string }>;
}) {
  const { group: selectedGroupId } = await searchParams;
  const [groups, session] = await Promise.all([getGroups(), sdk.auth.getSession()]);
  const canManageGroups = sdk.auth.hasCapability(session, 'user:manage');

  // Selection (and thus the detail pane) only exists for someone who could
  // previously open `ManageGroupDialog` at all — matches that dialog's own
  // `canManageGroups` gate, no new information exposed to a non-manager.
  const selectedGroup =
    canManageGroups && selectedGroupId
      ? (groups.find((g) => g.id === selectedGroupId) ?? null)
      : null;
  const closeHref = '?';

  return (
    <div>
      <ConsolePageHeader
        title="Groups"
        count={`${groups.length} ${groups.length === 1 ? 'group' : 'groups'}`}
        action={canManageGroups ? <CreateGroupDialog /> : undefined}
        description="Groups are reusable audiences for app access policies and future operator workflows — not app-scoped roles."
      />

      {groups.length === 0 ? (
        <p className={styles.emptyTableMsg}>No groups yet. Create one to get started.</p>
      ) : (
        <ul className={[styles.cards, styles.cardsCapped].join(' ')}>
          {groups.map((group) => {
            const isSelected = group.id === selectedGroup?.id;
            return (
              <li
                key={group.id}
                className={[styles.card, isSelected ? styles.cardSelected : '']
                  .filter(Boolean)
                  .join(' ')}
              >
                {canManageGroups ? (
                  <Link
                    href={`?group=${group.id}`}
                    className={styles.cardLink}
                    aria-current={isSelected ? 'true' : undefined}
                  >
                    <span className={styles.cardTitleRow}>
                      <span className={styles.cardTitle}>{group.name}</span>
                      <Icon
                        name="chevron-right"
                        size="sm"
                        aria-hidden
                        className={[styles.textMuted, styles.cardChevron].join(' ')}
                      />
                    </span>
                    <span className={styles.cardDesc}>
                      {group.description ?? `Slug: ${group.slug}`}
                    </span>
                    <span className={styles.memberCount}>
                      {memberCountLabel(group.memberCount)}
                    </span>
                  </Link>
                ) : (
                  <>
                    <span className={styles.cardTitle}>{group.name}</span>
                    <span className={styles.cardDesc}>
                      {group.description ?? `Slug: ${group.slug}`}
                    </span>
                    <span className={styles.memberCount}>
                      {memberCountLabel(group.memberCount)}
                    </span>
                  </>
                )}
                {canManageGroups && (
                  <span className={styles.cardManageMobile}>
                    <ManageGroupDialog group={group} />
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {selectedGroup && (
        // `detailKey` forces a full remount on every selection change —
        // `GroupDetailFields`' Name/Description inputs are uncontrolled
        // (`defaultValue`) and its danger-zone confirmation is local
        // `useState`, both of which only ever read their initial value once.
        // This can't be a `key` prop on `GroupDetailPane` itself — see
        // `useConsoleDetailPane`'s doc comment for why that silently doesn't
        // work here (a real, found-live bug: it looked like it should force
        // a remount and didn't).
        <ConsoleDetailSlot detailKey={selectedGroup.id} closeHref={closeHref}>
          <GroupDetailPane group={selectedGroup} closeHref={closeHref} />
        </ConsoleDetailSlot>
      )}
    </div>
  );
}
