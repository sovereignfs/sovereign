'use client';

import { useState, useRef } from 'react';
import { Dialog } from '@sovereignfs/ui';
import { revokeSessionAction } from '../actions';
import styles from '../account.module.css';

export function RevokeSessionButton({ token }: { token: string }) {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <>
      <button type="button" className={styles.revokeButton} onClick={() => setOpen(true)}>
        Revoke
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} size="sm" aria-label="Revoke session">
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
      </Dialog>
      <form ref={formRef} action={revokeSessionAction} style={{ display: 'none' }}>
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="current" value="false" />
      </form>
    </>
  );
}
