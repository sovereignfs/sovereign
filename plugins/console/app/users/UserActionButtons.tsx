'use client';

import { useState, useRef, useEffect } from 'react';
import {
  toggleActiveAction,
  resetMfaAction,
  deleteUserAction,
  cancelInviteAction,
} from './actions';
import styles from '../console.module.css';

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
}

function ConfirmDialog({
  open,
  onClose,
  title,
  message,
  confirmLabel,
  onConfirm,
}: ConfirmDialogProps) {
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
    const handleClose = () => onClose();
    el.addEventListener('close', handleClose);
    return () => el.removeEventListener('close', handleClose);
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
          <button type="button" className={styles.dangerButton} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}

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
        message="This will permanently remove all their data from this instance, including their profile, activity history, plugin data, and files. This cannot be undone."
        confirmLabel="Delete permanently"
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
