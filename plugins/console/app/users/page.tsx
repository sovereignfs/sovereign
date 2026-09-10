import Link from 'next/link';
import { Badge, Icon } from '@sovereignfs/ui';
import { sdk } from '@sovereignfs/sdk';
import { CancelInviteButton } from './UserActionButtons';
import { UserCard } from './UserCard';
import { UserDetailPane } from './UserDetailPane';
import { InviteDialog } from './invite/InviteDialog';
import { ConsoleDetailSlot } from '../_components/ConsoleDetailSlot';
import { ConsolePageHeader } from '../_components/ConsolePageHeader';
import { ConsolePagination } from '../_components/ConsolePagination';
import { MemberStatusBadge, RoleBadge } from '../_components/badges';
import styles from '../console.module.css';
import { renderFetchSignal } from '../_lib/fetch-timeout';
import { parsePageParam } from '../_lib/pagination';

const PAGE_SIZE = 20;

interface MemberRow {
  id: string | null;
  email: string;
  name: string | null;
  role: string | null;
  status: 'active' | 'deactivated' | 'invited';
  isTestUser?: boolean;
  verificationLevel: 0 | 1 | 2 | 3;
  createdAt: string;
  expiresAt: string | null;
  lastLoginAt: string | null;
}

async function getMembers(): Promise<MemberRow[]> {
  const authUrl =
    process.env.SOVEREIGN_AUTH_URL ?? `http://localhost:${process.env.AUTH_PORT ?? '3001'}`;
  const adminKey = process.env.SOVEREIGN_ADMIN_KEY ?? '';
  try {
    const res = await fetch(`${authUrl}/api/admin/users`, {
      headers: { Authorization: `Bearer ${adminKey}` },
      cache: 'no-store',
      signal: renderFetchSignal(),
    });
    if (!res.ok) {
      console.error(`[users] fetch failed: ${res.status}`);
      return [];
    }
    return res.json() as Promise<MemberRow[]>;
  } catch (err) {
    console.error('[users] fetch error:', err instanceof Error ? err.message : err);
    return [];
  }
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; user?: string }>;
}) {
  const { page: pageParam, user: selectedUserId } = await searchParams;
  const page = parsePageParam(pageParam);

  const [allMembers, session] = await Promise.all([getMembers(), sdk.auth.getSession()]);

  const total = allMembers.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const members = allMembers.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const rangeStart = (safePage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(safePage * PAGE_SIZE, total);

  const canAssignRoles = sdk.auth.hasCapability(session, 'role:assign');
  const canManageUsers = sdk.auth.hasCapability(session, 'user:manage');

  // Looked up across the full fetched list, not just the current page's
  // slice — a selected user might not be on the page currently showing, but
  // the detail pane should still resolve (linkable/refreshable selection,
  // per workstream 0022 leg 2).
  const selectedMember = selectedUserId
    ? (allMembers.find((m) => m.id === selectedUserId) ?? null)
    : null;
  const closeHref = `?page=${safePage}`;

  return (
    <div>
      <ConsolePageHeader
        title="Users"
        count={`${total} ${total === 1 ? 'member' : 'members'}`}
        action={canManageUsers ? <InviteDialog /> : undefined}
      />

      {total === 0 ? (
        <p className={styles.emptyTableMsg}>No members yet. Invite one to get started.</p>
      ) : (
        <>
          <div className={styles.tableCard}>
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.th}>Name / Email</th>
                    <th className={styles.th}>Role</th>
                    <th className={styles.th}>Status</th>
                    <th className={styles.th}>Joined</th>
                    <th className={styles.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((member) => {
                    const isSelected = !!member.id && member.id === selectedMember?.id;
                    return (
                      <tr
                        key={member.id ?? `invite-${member.email}`}
                        className={[styles.tr, isSelected ? styles.trSelected : '']
                          .filter(Boolean)
                          .join(' ')}
                      >
                        <td className={styles.td}>
                          <div className={styles.userCell}>
                            {member.id ? (
                              <Link
                                href={`?page=${safePage}&user=${member.id}`}
                                className={styles.userCellLink}
                                aria-current={isSelected ? 'true' : undefined}
                              >
                                <span className={styles.userName}>{member.name ?? '—'}</span>
                                <span className={styles.userEmail}>{member.email}</span>
                              </Link>
                            ) : (
                              <>
                                <span className={styles.userName}>{member.name ?? '—'}</span>
                                <span className={styles.userEmail}>{member.email}</span>
                              </>
                            )}
                          </div>
                        </td>

                        <td className={styles.td}>
                          <RoleBadge role={member.role} />
                        </td>

                        <td className={styles.td}>
                          <span className={styles.badgeGroup}>
                            <MemberStatusBadge status={member.status} />
                            {member.isTestUser && (
                              <Badge variant="mono" size="sm">
                                Test
                              </Badge>
                            )}
                          </span>
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
                            <Icon
                              name="chevron-right"
                              size="sm"
                              aria-hidden
                              className={styles.textMuted}
                            />
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

          {/* Mobile: card list (hidden on desktop via CSS) — unchanged by the
          desktop detail-column redesign; no persistent sidebar/detail
          columns exist on mobile (see layout.tsx). */}
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
        </>
      )}

      <ConsolePagination
        page={safePage}
        totalPages={totalPages}
        rangeStart={total === 0 ? 0 : rangeStart}
        rangeEnd={rangeEnd}
        total={total}
        hrefFor={(p) => `?page=${p}`}
      />

      {selectedMember && (
        // `detailKey` forces a full remount on every selection change —
        // `RoleSelect`'s `useState(role)` only reads its initial value once,
        // so switching users left the role dropdown frozen on whichever user
        // was selected first. This can't be a `key` prop on `UserDetailPane`
        // itself — see `useConsoleDetailPane`'s doc comment for why that
        // silently doesn't work here (a real, found-live bug: it looked
        // like it should force a remount and didn't).
        <ConsoleDetailSlot detailKey={selectedMember.id} closeHref={closeHref}>
          <UserDetailPane
            member={selectedMember}
            canAssignRoles={canAssignRoles}
            canManageUsers={canManageUsers}
            closeHref={closeHref}
          />
        </ConsoleDetailSlot>
      )}
    </div>
  );
}
