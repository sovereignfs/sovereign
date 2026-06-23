'use client';

import { useState, useRef, useEffect } from 'react';
import { toggleActiveAction, resetMfaAction, deleteUserAction } from './actions';
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
      <button type="button" className={styles.deactivateButton} onClick={() => setOpen(true)}>
        Deactivate
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
      <button type="button" className={styles.dangerButton} onClick={() => setOpen(true)}>
        Delete…
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
        className={styles.resetMfaButton}
        title="Remove all TOTP secrets and passkeys so the user can sign in without MFA"
        onClick={() => setOpen(true)}
      >
        Reset MFA
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
