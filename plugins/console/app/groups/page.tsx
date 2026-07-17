import { sdk } from '@sovereignfs/sdk';
import { ManageGroupDialog } from './ManageGroupDialog';
import { CreateGroupDialog } from './CreateGroupDialog';
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

export default async function GroupsPage() {
  const [groups, session] = await Promise.all([getGroups(), sdk.auth.getSession()]);
  const canManageGroups = sdk.auth.hasCapability(session, 'user:manage');

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
        Groups are reusable audiences for plugin access policies and future operator workflows — not
        plugin-scoped roles.
      </p>

      {groups.length === 0 ? (
        <p className={styles.emptyTableMsg}>No groups yet. Create one to get started.</p>
      ) : (
        <ul className={styles.cards}>
          {groups.map((group) => (
            <li key={group.id} className={styles.card}>
              <span className={styles.cardTitle}>{group.name}</span>
              <span className={styles.cardDesc}>{group.description ?? `Slug: ${group.slug}`}</span>
              {canManageGroups && <ManageGroupDialog group={group} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
