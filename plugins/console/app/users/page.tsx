import Link from 'next/link';
import { Badge } from '@sovereignfs/ui';
import { sdk } from '@sovereignfs/sdk';
import { toggleActiveAction } from './actions';
import {
  CancelInviteButton,
  DeactivateButton,
  DeleteButton,
  ResetMfaButton,
} from './UserActionButtons';
import { RoleSelect } from './RoleSelect';
import { UserCard } from './UserCard';
import styles from '../console.module.css';

const PAGE_SIZE = 5;

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
  return (
    <Badge variant="status" status={status}>
      {status === 'active' ? 'Active' : status === 'deactivated' ? 'Deactivated' : 'Invited'}
    </Badge>
  );
}

function RoleCell({ member, canAssignRoles }: { member: MemberRow; canAssignRoles: boolean }) {
  const isOwner = member.role === 'platform:owner';

  if (isOwner) {
    return <Badge variant="role">Owner</Badge>;
  }

  if (!canAssignRoles || !member.id) {
    const label =
      member.role === 'platform:admin'
        ? 'Admin'
        : member.role === 'platform:auditor'
          ? 'Auditor'
          : 'User';
    return <Badge variant="role">{label}</Badge>;
  }

  return <RoleSelect userId={member.id} role={member.role ?? 'platform:user'} />;
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
  const rangeStart = (safePage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(safePage * PAGE_SIZE, total);

  const canAssignRoles = sdk.auth.hasCapability(session, 'role:assign');
  const canManageUsers = sdk.auth.hasCapability(session, 'user:manage');

  return (
    <div>
      <div className={styles.pageHeader}>
        <h2 className={styles.pageTitle}>Users</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sv-space-3)' }}>
          <span className={styles.memberCount}>{total} members</span>
          {canManageUsers && (
            <Link href="/console/users/invite" className={styles.actionButton}>
              Invite user
            </Link>
          )}
        </div>
      </div>

      <div className={styles.tableCard}>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Name / Email</th>
                <th className={styles.th}>Role</th>
                <th className={styles.th}>Status</th>
                <th className={styles.th}>Joined</th>
                <th className={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => {
                const isOwner = member.role === 'platform:owner';
                const actionsLocked = isOwner || !canManageUsers;
                return (
                  <tr key={member.id ?? `invite-${member.email}`} className={styles.tr}>
                    <td className={styles.td}>
                      <div className={styles.userCell}>
                        <span className={styles.userName}>{member.name ?? '—'}</span>
                        <span className={styles.userEmail}>{member.email}</span>
                        {member.id && (
                          <span className={styles.userId} title="User ID">
                            {member.id}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className={styles.td}>
                      <RoleCell member={member} canAssignRoles={canAssignRoles} />
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
                      {member.status === 'invited' ? (
                        canManageUsers ? (
                          <div className={styles.rowActions}>
                            <CancelInviteButton email={member.email} />
                          </div>
                        ) : (
                          <span className={styles.textMuted}>—</span>
                        )
                      ) : member.id ? (
                        actionsLocked ? (
                          <span className={styles.textMuted}>Protected</span>
                        ) : (
                          <div className={styles.rowActions}>
                            {member.status === 'active' ? (
                              <DeactivateButton
                                userId={member.id}
                                name={member.name ?? member.email}
                              />
                            ) : (
                              <form action={toggleActiveAction}>
                                <input type="hidden" name="userId" value={member.id} />
                                <input type="hidden" name="active" value="true" />
                                <button
                                  type="submit"
                                  className={styles.iconBtnReactivate}
                                  title="Reactivate user"
                                >
                                  <svg
                                    width="15"
                                    height="15"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    aria-hidden="true"
                                  >
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                </button>
                              </form>
                            )}

                            <ResetMfaButton userId={member.id} name={member.name ?? member.email} />

                            <DeleteButton userId={member.id} name={member.name ?? member.email} />
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
      </div>

      {/* Mobile: card list (hidden on desktop via CSS) */}
      <div className={styles.userCardList}>
        {members.map((member) => (
          <UserCard
            key={member.id ?? `invite-${member.email}`}
            member={member}
            canAssignRoles={canAssignRoles}
            canManageUsers={canManageUsers}
          />
        ))}
      </div>

      <div className={styles.usersPagination}>
        <span className={styles.paginationInfo}>
          Showing {rangeStart}–{rangeEnd} of {total}
        </span>
        <div className={styles.paginationControls}>
          {safePage > 1 ? (
            <Link replace href={`?page=${safePage - 1}`} className={styles.paginationLink}>
              ← Prev
            </Link>
          ) : (
            <span className={styles.paginationDisabled}>← Prev</span>
          )}
          <span className={styles.paginationInfo}>
            {safePage} / {totalPages}
          </span>
          {safePage < totalPages ? (
            <Link replace href={`?page=${safePage + 1}`} className={styles.paginationLink}>
              Next →
            </Link>
          ) : (
            <span className={styles.paginationDisabled}>Next →</span>
          )}
        </div>
      </div>
    </div>
  );
}
