'use client';

import Link from 'next/link';
import { Badge, Icon } from '@sovereignfs/ui';
import { RoleSelect } from './RoleSelect';
import { UserCapabilitiesFields } from './UserCapabilitiesFields';
import {
  DeactivateButton,
  DeleteButton,
  ResetMfaButton,
  RevokeVouchButton,
  VouchButton,
} from './UserActionButtons';
import { toggleActiveAction } from './actions';
import { CopyIdButton } from '../_components/CopyIdButton';
import styles from '../console.module.css';

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

function formatLastLogin(lastLoginAt: string | null): string {
  if (!lastLoginAt) return 'Never';
  return new Date(lastLoginAt).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Desktop `ThreeColumnLayout` detail column for a selected user —
 * consolidates role assignment, capabilities, and status actions that used
 * to live behind `CapabilitiesButton`'s dialog and a row of icon buttons.
 * Rendered via `ConsoleDetailSlot` from `users/page.tsx`; `closeHref` drops
 * the `?user=` param while preserving `?page=`.
 */
export function UserDetailPane({
  member,
  canAssignRoles,
  canManageUsers,
  closeHref,
}: {
  member: MemberRow;
  canAssignRoles: boolean;
  canManageUsers: boolean;
  closeHref: string;
}) {
  const isOwner = member.role === 'platform:owner';
  const actionsLocked = isOwner || !canManageUsers;
  const userId = member.id;

  return (
    <div className={styles.detailPane}>
      <div className={styles.detailHeader}>
        <div className={styles.detailHeading}>
          <span className={styles.detailTitleLabel}>{member.name ?? '—'}</span>
          <span className={styles.detailSubtitle}>{member.email}</span>
        </div>
        <Link
          replace
          href={closeHref}
          className={styles.iconBtn}
          aria-label="Close user detail"
          title="Close"
        >
          <Icon name="x" size="sm" aria-hidden />
        </Link>
      </div>

      {userId && (
        <span className={styles.userIdRow}>
          <span className={styles.userId} title={userId}>
            {userId}
          </span>
          <CopyIdButton value={userId} label="Copy user ID" />
        </span>
      )}

      <span className={styles.detailMeta}>Last login: {formatLastLogin(member.lastLoginAt)}</span>

      <div className={styles.detailBadges}>
        <Badge variant="status" size="sm" status={member.status}>
          {member.status === 'active'
            ? 'Active'
            : member.status === 'deactivated'
              ? 'Deactivated'
              : 'Invited'}
        </Badge>
        {member.isTestUser && (
          <Badge variant="mono" size="sm">
            Test
          </Badge>
        )}
      </div>

      <div className={styles.detailSection}>
        <h3 className={styles.detailSectionTitle}>Role</h3>
        {isOwner ? (
          <span className={styles.detailRoleBadge}>
            <Badge variant="role" size="sm">
              Owner
            </Badge>
          </span>
        ) : canAssignRoles && userId ? (
          <RoleSelect userId={userId} role={member.role ?? 'platform:user'} />
        ) : (
          <span className={styles.detailRoleBadge}>
            <Badge variant="role" size="sm">
              {member.role === 'platform:admin'
                ? 'Admin'
                : member.role === 'platform:auditor'
                  ? 'Auditor'
                  : 'User'}
            </Badge>
          </span>
        )}
      </div>

      {isOwner ? (
        <p className={styles.adminOnlyNote}>The platform owner is protected from these actions.</p>
      ) : (
        userId &&
        canManageUsers && (
          <>
            <div className={styles.detailSection}>
              <h3 className={styles.detailSectionTitle}>Capabilities</h3>
              <p className={styles.helpText}>
                Grant one additional capability this user&apos;s role preset doesn&apos;t include.
                This does not change their role.
              </p>
              <UserCapabilitiesFields userId={userId} />
            </div>

            {!actionsLocked && (
              <div className={styles.detailSection}>
                <h3 className={styles.detailSectionTitle}>Actions</h3>
                <div className={styles.rowActions}>
                  {member.status === 'active' ? (
                    <DeactivateButton userId={userId} name={member.name ?? member.email} />
                  ) : (
                    <form action={toggleActiveAction}>
                      <input type="hidden" name="userId" value={userId} />
                      <input type="hidden" name="active" value="true" />
                      <button
                        type="submit"
                        className={styles.iconBtnReactivate}
                        title="Reactivate user"
                      >
                        <Icon name="check" size="sm" aria-hidden />
                      </button>
                    </form>
                  )}
                  <ResetMfaButton userId={userId} name={member.name ?? member.email} />
                  {member.verificationLevel === 3 ? (
                    <RevokeVouchButton userId={userId} name={member.name ?? member.email} />
                  ) : (
                    <VouchButton userId={userId} name={member.name ?? member.email} />
                  )}
                  <DeleteButton userId={userId} name={member.name ?? member.email} />
                </div>
              </div>
            )}
          </>
        )
      )}
    </div>
  );
}
