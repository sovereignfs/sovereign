'use client';

import { useState } from 'react';
import { Button, Dialog } from '@sovereignfs/ui';
import { InviteForm } from './invite-form';
import styles from '../../console.module.css';

export function InviteDialog() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        + Invite
      </Button>

      <Dialog open={open} onClose={() => setOpen(false)} size="sm" title="Invite user">
        <div className={styles.inviteDialogBody}>
          <p className={styles.lede}>
            Send an invitation email. The recipient must register using the invited email address.
          </p>
          <InviteForm onSuccess={() => setOpen(false)} />
        </div>
      </Dialog>
    </>
  );
}
