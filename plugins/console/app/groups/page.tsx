import Link from 'next/link';
import { Icon } from '@sovereignfs/ui';
import { sdk } from '@sovereignfs/sdk';
import { ManageGroupDialog } from './ManageGroupDialog';
import { CreateGroupDialog } from './CreateGroupDialog';
import { GroupDetailPane } from './GroupDetailPane';
import { ConsoleDetailSlot } from '../_components/ConsoleDetailSlot';
import styles from '../console.module.css';

interface GroupRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: number;
}

async function getGroups(): Promise<GroupRow[]> {
  const selfUrl = `http://localhost:${process.env.RUNTIME_PORT ?? '3000'}`;
  const adminKey = process.env.SOVEREIGN_ADMIN_KEY ?? '';
  try {
    const res = await fetch(`${selfUrl}/api/admin/groups`, {
      headers: { Authorization: `Bearer ${adminKey}` },
      cache: 'no-store',
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
      <div className={styles.pageHeader}>
        <h2 className={styles.pageTitle}>Groups</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sv-space-3)' }}>
          <span className={styles.memberCount}>{groups.length} groups</span>
          {canManageGroups && <CreateGroupDialog />}
        </div>
      </div>

      <p className={styles.lede}>
        Groups are reusable audiences for app access policies and future operator workflows — not
        app-scoped roles.
      </p>

      {groups.length === 0 ? (
        <p className={styles.emptyTableMsg}>No groups yet. Create one to get started.</p>
      ) : (
        <ul
          className={styles.cards}
          // A capped max track width (instead of the shared 1fr) so a
          // handful of groups don't stretch to fill the entire row width —
          // unlike Console home/Health's `.cards` usage, this list is
          // typically short (a handful of groups per instance).
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 320px))' }}
        >
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
                  <Link href={`?group=${group.id}`} className={styles.cardLink}>
                    <span className={styles.cardTitle}>{group.name}</span>
                    <span className={styles.cardDesc}>
                      {group.description ?? `Slug: ${group.slug}`}
                    </span>
                  </Link>
                ) : (
                  <>
                    <span className={styles.cardTitle}>{group.name}</span>
                    <span className={styles.cardDesc}>
                      {group.description ?? `Slug: ${group.slug}`}
                    </span>
                  </>
                )}
                {canManageGroups && (
                  <>
                    <Icon
                      name="chevron-right"
                      size="sm"
                      aria-hidden
                      className={[styles.textMuted, styles.cardChevron].join(' ')}
                    />
                    <span className={styles.cardManageMobile}>
                      <ManageGroupDialog group={group} />
                    </span>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {selectedGroup && (
        <ConsoleDetailSlot>
          <GroupDetailPane group={selectedGroup} closeHref={closeHref} />
        </ConsoleDetailSlot>
      )}
    </div>
  );
}
