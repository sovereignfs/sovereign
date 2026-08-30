'use client';

import { useState, useRef } from 'react';
import { ConfirmDialog } from '@sovereignfs/ui';
import {
  toggleActiveAction,
  resetMfaAction,
  vouchAction,
  revokeVouchAction,
  deleteUserAction,
  cancelInviteAction,
} from './actions';
import styles from '../console.module.css';

export function DeactivateButton({ userId, name }: { userId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <>
      <button
        type="button"
        className={styles.iconBtn}
        title="Deactivate user"
        onClick={() => setOpen(true)}
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
          <circle cx="12" cy="12" r="10" />
          <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
        </svg>
      </button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Deactivate user"
        message={`Deactivate ${name || userId}? They will not be able to sign in until reactivated.`}
        confirmLabel="Deactivate"
        destructive
        onConfirm={() => {
          setOpen(false);
          formRef.current?.requestSubmit();
        }}
      />
      <form ref={formRef} action={toggleActiveAction} style={{ display: 'none' }}>
        <input type="hidden" name="userId" value={userId} />
        <input type="hidden" name="active" value="false" />
      </form>
    </>
  );
}

export function DeleteButton({ userId, name }: { userId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <>
      <button
        type="button"
        className={styles.iconBtnDanger}
        title="Delete user"
        onClick={() => setOpen(true)}
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
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          <path d="M10 11v6M14 11v6" />
          <path d="M9 6V4h6v2" />
        </svg>
      </button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Delete user: ${name || userId}?`}
        message="This will permanently remove all their data from this instance, including their profile, activity history, app data, and files. This cannot be undone."
        confirmLabel="Delete permanently"
        destructive
        onConfirm={() => {
          setOpen(false);
          formRef.current?.requestSubmit();
        }}
      />
      <form ref={formRef} action={deleteUserAction} style={{ display: 'none' }}>
        <input type="hidden" name="userId" value={userId} />
      </form>
    </>
  );
}

export function ResetMfaButton({ userId, name }: { userId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <>
      <button
        type="button"
        className={styles.iconBtn}
        title="Reset MFA — removes all TOTP secrets and passkeys"
        onClick={() => setOpen(true)}
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
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
        </svg>
      </button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Reset MFA"
        message={`Remove all MFA methods for ${name || userId}? They will be able to sign in with only their password.`}
        confirmLabel="Reset MFA"
        destructive
        onConfirm={() => {
          setOpen(false);
          formRef.current?.requestSubmit();
        }}
      />
      <form ref={formRef} action={resetMfaAction} style={{ display: 'none' }}>
        <input type="hidden" name="userId" value={userId} />
      </form>
    </>
  );
}

export function VouchButton({ userId, name }: { userId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <>
      <button
        type="button"
        className={styles.iconBtn}
        title="Vouch — grants verification level 3 (admin_vouched)"
        onClick={() => setOpen(true)}
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
          <path d="M9 12l2 2 4-4" />
          <circle cx="12" cy="12" r="10" />
        </svg>
      </button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Vouch for user"
        message={`Vouch for ${name || userId}? This grants full trust (verification level 3).`}
        confirmLabel="Vouch"
        onConfirm={() => {
          setOpen(false);
          formRef.current?.requestSubmit();
        }}
      />
      <form ref={formRef} action={vouchAction} style={{ display: 'none' }}>
        <input type="hidden" name="userId" value={userId} />
      </form>
    </>
  );
}

export function RevokeVouchButton({ userId, name }: { userId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <>
      <button
        type="button"
        className={styles.iconBtn}
        title="Revoke vouch — drops back to verification level 2"
        onClick={() => setOpen(true)}
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
          <circle cx="12" cy="12" r="10" />
          <line x1="9" y1="9" x2="15" y2="15" />
          <line x1="15" y1="9" x2="9" y2="15" />
        </svg>
      </button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Revoke vouch"
        message={`Revoke the vouch for ${name || userId}? Their verification level drops to 2.`}
        confirmLabel="Revoke vouch"
        destructive
        onConfirm={() => {
          setOpen(false);
          formRef.current?.requestSubmit();
        }}
      />
      <form ref={formRef} action={revokeVouchAction} style={{ display: 'none' }}>
        <input type="hidden" name="userId" value={userId} />
      </form>
    </>
  );
}

export function CancelInviteButton({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <>
      <button
        type="button"
        className={styles.iconBtnDanger}
        title="Cancel invite"
        onClick={() => setOpen(true)}
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
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          <path d="M10 11v6M14 11v6" />
          <path d="M9 6V4h6v2" />
        </svg>
      </button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Cancel invite"
        message={`Cancel the pending invite for ${email}? They will no longer be able to use this invite link.`}
        confirmLabel="Cancel invite"
        destructive
        onConfirm={() => {
          setOpen(false);
          formRef.current?.requestSubmit();
        }}
      />
      <form ref={formRef} action={cancelInviteAction} style={{ display: 'none' }}>
        <input type="hidden" name="email" value={email} />
      </form>
    </>
  );
}
