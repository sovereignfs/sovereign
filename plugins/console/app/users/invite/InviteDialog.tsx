'use client';

import { useState } from 'react';
import {
  Button,
  Dialog,
  DialogBody,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@sovereignfs/ui';
import { InviteForm } from './invite-form';

export function InviteDialog() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        + Invite
      </Button>

      <Dialog open={open} onClose={() => setOpen(false)} size="sm">
        <DialogHeader>
          <DialogTitle>Invite user</DialogTitle>
          <DialogDescription>
            Send an invitation email. The recipient must register using the invited email address.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <InviteForm onSuccess={() => setOpen(false)} />
        </DialogBody>
      </Dialog>
    </>
  );
}
