'use client';

import { Badge } from '@sovereignfs/ui';
import { RoleSelect } from './RoleSelect';
import { UserCapabilitiesFields } from './UserCapabilitiesFields';
import {
  DeactivateButton,
  DeleteButton,
  ReactivateButton,
  ResetMfaButton,
  RevokeVouchButton,
  VouchButton,
} from './UserActionButtons';
import { DetailIdRow, DetailPaneHeader, DetailSection } from '../_components/DetailPaneHeader';
import { MemberStatusBadge, RoleBadge } from '../_components/badges';
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
  const displayName = member.name ?? member.email;

  return (
    <div className={styles.detailPane}>
      <DetailPaneHeader
        title={member.name ?? '—'}
        subtitle={member.email}
        closeHref={closeHref}
        closeLabel="Close user detail"
      />

      {userId && <DetailIdRow value={userId} label="Copy user ID" />}

      <span className={styles.detailMeta}>Last login: {formatLastLogin(member.lastLoginAt)}</span>

      <div className={styles.detailBadges}>
        <MemberStatusBadge status={member.status} />
        {member.isTestUser && (
          <Badge variant="mono" size="sm">
            Test
          </Badge>
        )}
      </div>

      <DetailSection title="Role">
        {!isOwner && canAssignRoles && userId ? (
          <RoleSelect userId={userId} role={member.role ?? 'platform:user'} />
        ) : (
          <span className={styles.detailRoleBadge}>
            <RoleBadge role={member.role} />
          </span>
        )}
      </DetailSection>

      {isOwner ? (
        <p className={styles.adminOnlyNote}>The platform owner is protected from these actions.</p>
      ) : (
        userId &&
        canManageUsers && (
          <>
            <DetailSection
              title="Capabilities"
              description="Grant one additional capability this user's role preset doesn't include. This does not change their role."
            >
              <UserCapabilitiesFields userId={userId} />
            </DetailSection>

            {!actionsLocked && (
              <DetailSection title="Actions">
                <div className={styles.rowActions}>
                  {member.status === 'active' ? (
                    <DeactivateButton userId={userId} name={displayName} />
                  ) : (
                    <ReactivateButton userId={userId} name={displayName} />
                  )}
                  <ResetMfaButton userId={userId} name={displayName} />
                  {member.verificationLevel === 3 ? (
                    <RevokeVouchButton userId={userId} name={displayName} />
                  ) : (
                    <VouchButton userId={userId} name={displayName} />
                  )}
                  <DeleteButton userId={userId} name={displayName} />
                </div>
              </DetailSection>
            )}
          </>
        )
      )}
    </div>
  );
}
