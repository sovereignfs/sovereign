'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { Badge, useToast } from '@sovereignfs/ui';
import {
  cancelInviteAction,
  changeRoleAction,
  deleteUserAction,
  resetMfaAction,
  toggleActiveAction,
} from './actions';
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

type ConfirmType = 'deactivate' | 'reactivate' | 'reset-mfa' | 'delete' | 'cancel-invite' | null;

function roleName(role: string | null) {
  if (role === 'platform:owner') return 'Owner';
  if (role === 'platform:admin') return 'Admin';
  return 'User';
}

function ConfirmSheet({
  open,
  onClose,
  title,
  message,
  confirmLabel,
  danger,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open) el.showModal();
    else el.close();
  }, [open]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onClose_ = () => onClose();
    el.addEventListener('close', onClose_);
    return () => el.removeEventListener('close', onClose_);
  }, [onClose]);

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={ref}
      className={styles.confirmNativeDialog}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.confirmDialog}>
        <h2 className={styles.confirmTitle}>{title}</h2>
        <p className={styles.confirmMessage}>{message}</p>
        <div className={styles.confirmActions}>
          <button type="button" className={styles.actionButton} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={danger ? styles.dangerButton : styles.actionButton}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}

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
  const menuRef = useRef<HTMLDivElement>(null);

  const isOwner = member.role === 'platform:owner';
  const actionsLocked = isOwner || !canManageUsers;
  const initial = ((member.name ?? member.email)[0] ?? '?').toUpperCase();
  const userId = member.id ?? '';

  const showRoleOptions = !isOwner && canAssignRoles && !!member.id && member.status !== 'invited';
  const showStatusActions = !!member.id && !actionsLocked;
  const showCancelInvite = member.status === 'invited' && canManageUsers;
  const hasMenu = showRoleOptions || showStatusActions || showCancelInvite;

  useEffect(() => {
    if (!menuOpen) return;
    function handlePointerDown(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [menuOpen]);

  function changeRole(newRole: string) {
    setMenuOpen(false);
    if (!userId) return;
    const prev = currentRole;
    setCurrentRole(newRole);
    startTransition(async () => {
      const fd = new FormData();
      fd.set('userId', userId);
      fd.set('role', newRole);
      try {
        await changeRoleAction(fd);
        const label = newRole === 'platform:admin' ? 'Admin' : 'User';
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
        </div>
      </div>

      {/* ⋯ menu */}
      {hasMenu && (
        <div ref={menuRef} className={styles.userCardMenuWrap}>
          <button
            type="button"
            className={styles.userCardMenuBtn}
            aria-label={`Actions for ${member.name ?? member.email}`}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            disabled={isPending}
            onClick={() => setMenuOpen((v) => !v)}
          >
            •••
          </button>

          {menuOpen && (
            <div className={styles.userCardMenu} role="menu">
              {/* Role options */}
              {showRoleOptions && (
                <>
                  {currentRole !== 'platform:admin' && (
                    <button
                      type="button"
                      className={styles.userCardMenuItem}
                      role="menuitem"
                      onClick={() => changeRole('platform:admin')}
                    >
                      Make Admin
                    </button>
                  )}
                  {currentRole !== 'platform:user' && (
                    <button
                      type="button"
                      className={styles.userCardMenuItem}
                      role="menuitem"
                      onClick={() => changeRole('platform:user')}
                    >
                      Make User
                    </button>
                  )}
                  {(showStatusActions || showCancelInvite) && (
                    <div className={styles.userCardMenuDivider} role="separator" />
                  )}
                </>
              )}

              {/* Status / lifecycle actions */}
              {showStatusActions && (
                <>
                  {member.status === 'active' && (
                    <button
                      type="button"
                      className={styles.userCardMenuItem}
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        setConfirm('deactivate');
                      }}
                    >
                      Deactivate
                    </button>
                  )}
                  {member.status === 'deactivated' && (
                    <button
                      type="button"
                      className={styles.userCardMenuItem}
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        setConfirm('reactivate');
                      }}
                    >
                      Reactivate
                    </button>
                  )}
                  <button
                    type="button"
                    className={styles.userCardMenuItem}
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      setConfirm('reset-mfa');
                    }}
                  >
                    Reset MFA
                  </button>
                  <div className={styles.userCardMenuDivider} role="separator" />
                  <button
                    type="button"
                    className={`${styles.userCardMenuItem} ${styles.userCardMenuItemDanger}`}
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      setConfirm('delete');
                    }}
                  >
                    Delete user
                  </button>
                </>
              )}

              {showCancelInvite && (
                <button
                  type="button"
                  className={`${styles.userCardMenuItem} ${styles.userCardMenuItemDanger}`}
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setConfirm('cancel-invite');
                  }}
                >
                  Cancel invite
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Confirm dialogs */}
      <ConfirmSheet
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
      <ConfirmSheet
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
      <ConfirmSheet
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
      <ConfirmSheet
        open={confirm === 'delete'}
        onClose={() => setConfirm(null)}
        title={`Delete ${member.name || member.email}?`}
        message="This permanently removes all their data — profile, activity, plugin data, and files. Cannot be undone."
        confirmLabel="Delete permanently"
        danger
        onConfirm={() => {
          setConfirm(null);
          const fd = new FormData();
          fd.set('userId', userId);
          runAction(() => deleteUserAction(fd));
        }}
      />
      <ConfirmSheet
        open={confirm === 'cancel-invite'}
        onClose={() => setConfirm(null)}
        title="Cancel invite"
        message={`Cancel the pending invite for ${member.email}? The invite link will stop working.`}
        confirmLabel="Cancel invite"
        danger
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
