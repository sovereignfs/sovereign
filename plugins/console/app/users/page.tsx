import Link from 'next/link';
import { sdk } from '@sovereignfs/sdk';
import { changeRoleAction, toggleActiveAction } from './actions';
import { DeactivateButton, ResetMfaButton } from './UserActionButtons';
import styles from '../console.module.css';

const PAGE_SIZE = 50;

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

function RoleBadge({ role }: { role: string | null }) {
  if (!role) return <span className={styles.textMuted}>—</span>;
  if (role === 'platform:owner')
    return <span className={`${styles.badgeAdmin} ${styles.badgeOwner}`}>Owner</span>;
  if (role === 'platform:admin') return <span className={styles.badgeAdmin}>Admin</span>;
  if (role === 'platform:auditor') return <span className={styles.badgeAuditor}>Auditor</span>;
  return <span className={styles.badgeUser}>User</span>;
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam ?? '1'));

  const [allMembers, session] = await Promise.all([getMembers(), sdk.auth.getSession()]);

  const total = allMembers.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const members = allMembers.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const canAssignRoles = sdk.auth.hasCapability(session, 'role:assign');
  const canManageUsers = sdk.auth.hasCapability(session, 'user:manage');

  return (
    <div>
      <div className={styles.pageHeader}>
        <h2 className={styles.pageTitle}>Users</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sv-space-3)' }}>
          <span className={styles.textMuted}>{total} members</span>
          {canManageUsers && (
            <Link href="/console/users/invite" className={styles.actionButton}>
              Invite user
            </Link>
          )}
        </div>
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
            {members.map((member) => {
              const isOwner = member.role === 'platform:owner';
              // Owner row is always read-only; actions also require user:manage.
              const actionsLocked = isOwner || !canManageUsers;
              return (
                <tr key={member.id ?? `invite-${member.email}`} className={styles.tr}>
                  <td className={styles.td}>
                    <div className={styles.userCell}>
                      <span className={styles.userName}>{member.name ?? '—'}</span>
                      <span className={styles.userEmail}>{member.email}</span>
                      {member.id && (
                        <span className={styles.userId} title="User ID — click to select all">
                          {member.id}
                        </span>
                      )}
                    </div>
                  </td>

                  <td className={styles.td}>
                    <RoleBadge role={member.role} />
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
                      actionsLocked ? (
                        <span className={styles.textMuted}>
                          {isOwner ? 'Owner — protected' : '—'}
                        </span>
                      ) : (
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
                          {canAssignRoles && (
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
                                <option value="platform:auditor">Auditor</option>
                                <option value="platform:admin">Admin</option>
                              </select>
                              <button type="submit" className={styles.actionButtonSmall}>
                                Save
                              </button>
                            </form>
                          )}

                          {member.status === 'active' ? (
                            <DeactivateButton
                              userId={member.id ?? ''}
                              name={member.name ?? member.email}
                            />
                          ) : (
                            <form action={toggleActiveAction}>
                              <input type="hidden" name="userId" value={member.id} />
                              <input type="hidden" name="active" value="true" />
                              <button type="submit" className={styles.reactivateButton}>
                                Reactivate
                              </button>
                            </form>
                          )}

                          <ResetMfaButton
                            userId={member.id ?? ''}
                            name={member.name ?? member.email}
                          />
                        </div>
                      )
                    ) : (
                      <span className={styles.textMuted}>—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className={styles.pagination}>
          {safePage > 1 ? (
            <Link href={`?page=${safePage - 1}`} className={styles.paginationLink}>
              ← Previous
            </Link>
          ) : (
            <span className={styles.paginationDisabled}>← Previous</span>
          )}
          <span className={styles.paginationInfo}>
            Page {safePage} of {totalPages}
          </span>
          {safePage < totalPages ? (
            <Link href={`?page=${safePage + 1}`} className={styles.paginationLink}>
              Next →
            </Link>
          ) : (
            <span className={styles.paginationDisabled}>Next →</span>
          )}
        </div>
      )}
    </div>
  );
}
