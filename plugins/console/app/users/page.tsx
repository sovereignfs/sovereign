import Link from 'next/link';
import { changeRoleAction, toggleActiveAction } from './actions';
import styles from '../console.module.css';

interface MemberRow {
  id: string | null;
  email: string;
  name: string | null;
  role: string | null;
  status: 'active' | 'deactivated' | 'invited';
  createdAt: string;
  expiresAt: string | null;
}

async function getMembers(): Promise<MemberRow[]> {
  const authUrl = process.env.SOVEREIGN_AUTH_URL ?? 'http://localhost:3001';
  const adminKey = process.env.SOVEREIGN_ADMIN_KEY ?? '';
  const res = await fetch(`${authUrl}/api/admin/users`, {
    headers: { Authorization: `Bearer ${adminKey}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Failed to fetch users: ${res.status}`);
  return res.json() as Promise<MemberRow[]>;
}

function StatusBadge({ status }: { status: MemberRow['status'] }) {
  if (status === 'active') return <span className={styles.badgeActive}>Active</span>;
  if (status === 'deactivated') return <span className={styles.badgeDeactivated}>Deactivated</span>;
  return <span className={styles.badgeInvited}>Invited</span>;
}

export default async function UsersPage() {
  const members = await getMembers();

  return (
    <div>
      <div className={styles.pageHeader}>
        <h2 className={styles.pageTitle}>Users</h2>
        <Link href="/console/users/invite" className={styles.actionButton}>
          Invite user
        </Link>
      </div>

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th}>Name / Email</th>
              <th className={styles.th}>Role</th>
              <th className={styles.th}>Status</th>
              <th className={styles.th}>Joined / Invited</th>
              <th className={styles.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.id ?? `invite-${member.email}`} className={styles.tr}>
                <td className={styles.td}>
                  <div className={styles.userCell}>
                    <span className={styles.userName}>{member.name ?? '—'}</span>
                    <span className={styles.userEmail}>{member.email}</span>
                  </div>
                </td>

                <td className={styles.td}>
                  {member.role ? (
                    <span
                      className={
                        member.role === 'platform:admin' ? styles.badgeAdmin : styles.badgeUser
                      }
                    >
                      {member.role === 'platform:admin' ? 'Admin' : 'User'}
                    </span>
                  ) : (
                    <span className={styles.textMuted}>—</span>
                  )}
                </td>

                <td className={styles.td}>
                  <StatusBadge status={member.status} />
                </td>

                <td className={styles.td}>
                  <time dateTime={new Date(member.createdAt).toISOString()}>
                    {new Date(member.createdAt).toLocaleDateString()}
                  </time>
                  {member.expiresAt && (
                    <span className={styles.expiryNote}>
                      {' '}
                      · expires {new Date(member.expiresAt).toLocaleDateString()}
                    </span>
                  )}
                </td>

                <td className={styles.td}>
                  {member.status !== 'invited' && member.id ? (
                    <div className={styles.rowActions}>
                      {/*
                        `key`s tie each form to the server state it renders. React
                        19 resets a form after its action runs, which reverts the
                        uncontrolled <select defaultValue> (role) and the
                        status-derived button to their pre-submit values even
                        though the row re-rendered with fresh data. Re-keying on
                        the value forces a remount so the controls reflect the
                        change (the Status/Role badges, not being form controls,
                        already update correctly).
                      */}
                      <form
                        action={changeRoleAction}
                        className={styles.roleForm}
                        key={`role-${member.role ?? 'none'}`}
                      >
                        <input type="hidden" name="userId" value={member.id} />
                        <select
                          name="role"
                          defaultValue={member.role ?? 'platform:user'}
                          className={styles.roleSelect}
                          aria-label={`Role for ${member.email}`}
                        >
                          <option value="platform:user">User</option>
                          <option value="platform:admin">Admin</option>
                        </select>
                        <button type="submit" className={styles.actionButtonSmall}>
                          Save
                        </button>
                      </form>

                      <form action={toggleActiveAction} key={`active-${member.status}`}>
                        <input type="hidden" name="userId" value={member.id} />
                        <input
                          type="hidden"
                          name="active"
                          value={member.status === 'active' ? 'false' : 'true'}
                        />
                        <button
                          type="submit"
                          className={
                            member.status === 'active'
                              ? styles.deactivateButton
                              : styles.reactivateButton
                          }
                        >
                          {member.status === 'active' ? 'Deactivate' : 'Reactivate'}
                        </button>
                      </form>
                    </div>
                  ) : (
                    <span className={styles.textMuted}>—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
