'use client';

import { useState, useRef } from 'react';
import { ConfirmDialog } from '@sovereignfs/ui';
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
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Revoke session"
        message="This will immediately sign out that device. The session cannot be restored."
        confirmLabel="Revoke"
        destructive
        onConfirm={() => {
          setOpen(false);
          formRef.current?.requestSubmit();
        }}
      />
      <form ref={formRef} action={revokeSessionAction} style={{ display: 'none' }}>
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="current" value="false" />
      </form>
    </>
  );
}
