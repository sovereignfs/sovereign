'use client';

import { useState, useTransition } from 'react';
import { Badge, ConfirmDialog, Icon, Menu, type MenuEntry, useToast } from '@sovereignfs/ui';
import {
  cancelInviteAction,
  changeRoleAction,
  deleteUserAction,
  resetMfaAction,
  toggleActiveAction,
} from './actions';
import { CapabilitiesButton } from './CapabilitiesButton';
import styles from '../console.module.css';

interface MemberRow {
  id: string | null;
  email: string;
  name: string | null;
  role: string | null;
  status: 'active' | 'deactivated' | 'invited';
  isTestUser?: boolean;
  createdAt: string;
  expiresAt: string | null;
}

type ConfirmType = 'deactivate' | 'reactivate' | 'reset-mfa' | 'delete' | 'cancel-invite' | null;

function roleName(role: string | null) {
  if (role === 'platform:owner') return 'Owner';
  if (role === 'platform:admin') return 'Admin';
  if (role === 'platform:auditor') return 'Auditor';
  return 'User';
}

const ASSIGNABLE_ROLES = [
  { value: 'platform:admin', label: 'Admin' },
  { value: 'platform:auditor', label: 'Auditor' },
  { value: 'platform:user', label: 'User' },
] as const;

export function UserCard({
  member,
  canAssignRoles,
  canManageUsers,
}: {
  member: MemberRow;
  canAssignRoles: boolean;
  canManageUsers: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmType>(null);
  const [currentRole, setCurrentRole] = useState(member.role ?? 'platform:user');
  const [isPending, startTransition] = useTransition();
  const toast = useToast();

  const isOwner = member.role === 'platform:owner';
  const actionsLocked = isOwner || !canManageUsers;
  const initial = ((member.name ?? member.email)[0] ?? '?').toUpperCase();
  const userId = member.id ?? '';

  const showRoleOptions = !isOwner && canAssignRoles && !!member.id && member.status !== 'invited';
  const showStatusActions = !!member.id && !actionsLocked;
  const showCancelInvite = member.status === 'invited' && canManageUsers;
  const hasMenu = showRoleOptions || showStatusActions || showCancelInvite;

  function changeRole(newRole: string) {
    if (!userId) return;
    const prev = currentRole;
    setCurrentRole(newRole);
    startTransition(async () => {
      const fd = new FormData();
      fd.set('userId', userId);
      fd.set('role', newRole);
      try {
        await changeRoleAction(fd);
        const label = ASSIGNABLE_ROLES.find((r) => r.value === newRole)?.label ?? newRole;
        toast.show({ title: 'Role updated', message: `Changed to ${label}.`, category: 'success' });
      } catch {
        setCurrentRole(prev);
        toast.show({ title: 'Failed to update role', category: 'error' });
      }
    });
  }

  function runAction(action: () => Promise<void>) {
    startTransition(async () => {
      try {
        await action();
      } catch {
        toast.show({ title: 'Action failed', category: 'error' });
      }
    });
  }

  const menuItems: MenuEntry[] = [
    ...(showRoleOptions
      ? ([
          ...ASSIGNABLE_ROLES.filter((r) => r.value !== currentRole).map((r) => ({
            label: `Make ${r.label}`,
            onSelect: () => changeRole(r.value),
          })),
          ...(showStatusActions || showCancelInvite ? [{ type: 'separator' as const }] : []),
        ] satisfies MenuEntry[])
      : []),
    ...(showStatusActions
      ? ([
          ...(member.status === 'active'
            ? [{ label: 'Deactivate', onSelect: () => setConfirm('deactivate') }]
            : []),
          ...(member.status === 'deactivated'
            ? [{ label: 'Reactivate', onSelect: () => setConfirm('reactivate') }]
            : []),
          { label: 'Reset MFA', onSelect: () => setConfirm('reset-mfa') },
          { type: 'separator' as const },
          { label: 'Delete user', destructive: true, onSelect: () => setConfirm('delete') },
        ] satisfies MenuEntry[])
      : []),
    ...(showCancelInvite
      ? ([
          {
            label: 'Cancel invite',
            destructive: true,
            onSelect: () => setConfirm('cancel-invite'),
          },
        ] satisfies MenuEntry[])
      : []),
  ];

  return (
    <div className={styles.userCard}>
      {/* Avatar */}
      <div className={styles.userCardAvatar} aria-hidden="true">
        {initial}
      </div>

      {/* Info */}
      <div className={styles.userCardInfo}>
        <span className={styles.userCardName}>{member.name ?? '—'}</span>
        <span className={styles.userCardEmail}>{member.email}</span>
        <div className={styles.userCardBadges}>
          <Badge variant="role">{roleName(currentRole)}</Badge>
          <Badge variant="status" status={member.status}>
            {member.status === 'active'
              ? 'Active'
              : member.status === 'deactivated'
                ? 'Deactivated'
                : 'Invited'}
          </Badge>
          {member.isTestUser && <Badge variant="mono">Test</Badge>}
        </div>
      </div>

      {showStatusActions && (
        <CapabilitiesButton userId={userId} name={member.name ?? member.email} />
      )}

      {/* ⋯ menu */}
      {hasMenu && (
        <Menu
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          aria-label={`Actions for ${member.name ?? member.email}`}
          align="right"
          items={menuItems}
          trigger={
            <button
              type="button"
              className={styles.userCardMenuBtn}
              aria-label={`Actions for ${member.name ?? member.email}`}
              disabled={isPending}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <Icon name="ellipsis-vertical" size="sm" aria-hidden />
            </button>
          }
        />
      )}

      {/* Confirm dialogs */}
      <ConfirmDialog
        open={confirm === 'deactivate'}
        onClose={() => setConfirm(null)}
        title="Deactivate user"
        message={`Deactivate ${member.name || member.email}? They won't be able to sign in until reactivated.`}
        confirmLabel="Deactivate"
        onConfirm={() => {
          setConfirm(null);
          const fd = new FormData();
          fd.set('userId', userId);
          fd.set('active', 'false');
          runAction(() => toggleActiveAction(fd));
        }}
      />
      <ConfirmDialog
        open={confirm === 'reactivate'}
        onClose={() => setConfirm(null)}
        title="Reactivate user"
        message={`Reactivate ${member.name || member.email}? They will be able to sign in again.`}
        confirmLabel="Reactivate"
        onConfirm={() => {
          setConfirm(null);
          const fd = new FormData();
          fd.set('userId', userId);
          fd.set('active', 'true');
          runAction(() => toggleActiveAction(fd));
        }}
      />
      <ConfirmDialog
        open={confirm === 'reset-mfa'}
        onClose={() => setConfirm(null)}
        title="Reset MFA"
        message={`Remove all MFA methods for ${member.name || member.email}? They'll sign in with password only.`}
        confirmLabel="Reset MFA"
        onConfirm={() => {
          setConfirm(null);
          const fd = new FormData();
          fd.set('userId', userId);
          runAction(() => resetMfaAction(fd));
        }}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        onClose={() => setConfirm(null)}
        title={`Delete ${member.name || member.email}?`}
        message="This permanently removes all their data — profile, activity, plugin data, and files. Cannot be undone."
        confirmLabel="Delete permanently"
        destructive
        onConfirm={() => {
          setConfirm(null);
          const fd = new FormData();
          fd.set('userId', userId);
          runAction(() => deleteUserAction(fd));
        }}
      />
      <ConfirmDialog
        open={confirm === 'cancel-invite'}
        onClose={() => setConfirm(null)}
        title="Cancel invite"
        message={`Cancel the pending invite for ${member.email}? The invite link will stop working.`}
        confirmLabel="Cancel invite"
        destructive
        onConfirm={() => {
          setConfirm(null);
          const fd = new FormData();
          fd.set('email', member.email);
          runAction(() => cancelInviteAction(fd));
        }}
      />
    </div>
  );
}
