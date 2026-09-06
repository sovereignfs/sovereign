'use client';

import { useState } from 'react';
import { ConfirmDialog, Icon, type IconName } from '@sovereignfs/ui';
import {
  toggleActiveAction,
  resetMfaAction,
  vouchAction,
  revokeVouchAction,
  deleteUserAction,
  cancelInviteAction,
} from './actions';
import type { ActionResult } from '../_lib/action-result';
import { useActionRunner } from '../_lib/use-action';
import styles from '../console.module.css';

type Tone = 'default' | 'success' | 'danger';

const TONE_CLASS: Record<Tone, string> = {
  default: styles.iconBtn,
  success: styles.iconBtnReactivate,
  danger: styles.iconBtnDanger,
};

/**
 * One icon-only user action behind a `ConfirmDialog`. The action runs via
 * `useActionRunner`, so a failure keeps the dialog open with the action's
 * own error (and a toast) instead of throwing the whole column into
 * `error.tsx`. Every trigger carries an `aria-label` — these were `title`-only
 * hand-drawn SVGs, invisible to assistive tech.
 */
function ConfirmedIconAction({
  icon,
  label,
  tone = 'default',
  title,
  message,
  confirmLabel,
  pendingLabel,
  destructive,
  successTitle,
  run,
}: {
  icon: IconName;
  label: string;
  tone?: Tone;
  title: string;
  message: string;
  confirmLabel: string;
  pendingLabel: string;
  destructive?: boolean;
  successTitle: string;
  run: () => Promise<ActionResult>;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runAction, pending] = useActionRunner();

  return (
    <>
      <button
        type="button"
        className={TONE_CLASS[tone]}
        aria-label={label}
        title={label}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        <Icon name={icon} size="sm" aria-hidden />
      </button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        message={message}
        confirmLabel={pending ? pendingLabel : confirmLabel}
        destructive={destructive}
        pending={pending}
        error={error}
        onConfirm={() => {
          void runAction(run, { successTitle }).then((result) => {
            if (result.ok) setOpen(false);
            else setError(result.error);
          });
        }}
      />
    </>
  );
}

function withFields(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

export function DeactivateButton({ userId, name }: { userId: string; name: string }) {
  return (
    <ConfirmedIconAction
      icon="ban"
      label="Deactivate user"
      title="Deactivate user"
      message={`Deactivate ${name || userId}? They will not be able to sign in until reactivated.`}
      confirmLabel="Deactivate"
      pendingLabel="Deactivating…"
      destructive
      successTitle="User deactivated"
      run={() => toggleActiveAction(withFields({ userId, active: 'false' }))}
    />
  );
}

export function ReactivateButton({ userId, name }: { userId: string; name: string }) {
  return (
    <ConfirmedIconAction
      icon="check"
      label="Reactivate user"
      tone="success"
      title="Reactivate user"
      message={`Reactivate ${name || userId}? They will be able to sign in again.`}
      confirmLabel="Reactivate"
      pendingLabel="Reactivating…"
      successTitle="User reactivated"
      run={() => toggleActiveAction(withFields({ userId, active: 'true' }))}
    />
  );
}

export function DeleteButton({ userId, name }: { userId: string; name: string }) {
  return (
    <ConfirmedIconAction
      icon="user-x"
      label="Delete user"
      tone="danger"
      title={`Delete user: ${name || userId}?`}
      message="This will permanently remove all their data from this instance, including their profile, activity history, app data, and files. This cannot be undone."
      confirmLabel="Delete permanently"
      pendingLabel="Deleting…"
      destructive
      successTitle="User deleted"
      run={() => deleteUserAction(withFields({ userId }))}
    />
  );
}

export function ResetMfaButton({ userId, name }: { userId: string; name: string }) {
  return (
    <ConfirmedIconAction
      icon="shield-off"
      label="Reset MFA"
      title="Reset MFA"
      message={`Remove all MFA methods (TOTP secrets and passkeys) for ${name || userId}? They will be able to sign in with only their password.`}
      confirmLabel="Reset MFA"
      pendingLabel="Resetting…"
      destructive
      successTitle="MFA reset"
      run={() => resetMfaAction(withFields({ userId }))}
    />
  );
}

export function VouchButton({ userId, name }: { userId: string; name: string }) {
  return (
    <ConfirmedIconAction
      icon="circle-check"
      label="Vouch for user"
      title="Vouch for user"
      message={`Vouch for ${name || userId}? This grants full trust (verification level 3).`}
      confirmLabel="Vouch"
      pendingLabel="Vouching…"
      successTitle="Vouched"
      run={() => vouchAction(withFields({ userId }))}
    />
  );
}

export function RevokeVouchButton({ userId, name }: { userId: string; name: string }) {
  return (
    <ConfirmedIconAction
      icon="circle-x"
      label="Revoke vouch"
      title="Revoke vouch"
      message={`Revoke the vouch for ${name || userId}? Their verification level drops to 2.`}
      confirmLabel="Revoke vouch"
      pendingLabel="Revoking…"
      destructive
      successTitle="Vouch revoked"
      run={() => revokeVouchAction(withFields({ userId }))}
    />
  );
}

export function CancelInviteButton({ email }: { email: string }) {
  return (
    <ConfirmedIconAction
      icon="trash-2"
      label="Cancel invite"
      tone="danger"
      title="Cancel invite"
      message={`Cancel the pending invite for ${email}? They will no longer be able to use this invite link.`}
      confirmLabel="Cancel invite"
      pendingLabel="Cancelling…"
      destructive
      successTitle="Invite cancelled"
      run={() => cancelInviteAction(withFields({ email }))}
    />
  );
}
