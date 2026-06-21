'use client';

import { useState, useRef, useEffect } from 'react';
import { revokeSessionAction } from '../actions';
import styles from '../account.module.css';

export function RevokeSessionButton({ token }: { token: string }) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open) el.showModal();
    else el.close();
  }, [open]);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    const handleClose = () => setOpen(false);
    el.addEventListener('close', handleClose);
    return () => el.removeEventListener('close', handleClose);
  }, []);

  return (
    <>
      <button type="button" className={styles.revokeButton} onClick={() => setOpen(true)}>
        Revoke
      </button>
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
      <dialog
        ref={dialogRef}
        className={styles.confirmNativeDialog}
        onClick={(e) => {
          if (e.target === e.currentTarget) setOpen(false);
        }}
      >
        <div className={styles.confirmDialog}>
          <h2 className={styles.confirmTitle}>Revoke session</h2>
          <p className={styles.confirmMessage}>
            This will immediately sign out that device. The session cannot be restored.
          </p>
          <div className={styles.confirmActions}>
            <button type="button" className={styles.buttonSecondary} onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className={styles.dangerButton}
              onClick={() => {
                setOpen(false);
                formRef.current?.requestSubmit();
              }}
            >
              Revoke
            </button>
          </div>
        </div>
      </dialog>
      <form ref={formRef} action={revokeSessionAction} style={{ display: 'none' }}>
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="current" value="false" />
      </form>
    </>
  );
}
