'use client';

import { useState } from 'react';
import { Dialog, Icon } from '@sovereignfs/ui';
import styles from '../console.module.css';
import { UserCapabilitiesFields } from './UserCapabilitiesFields';

/**
 * Mobile-only entry point — `UserCard.tsx`'s card list has no detail column
 * to render into, so it keeps a button+`Dialog` wrapper around the same
 * `UserCapabilitiesFields` the desktop `UserDetailPane` renders inline.
 */
export function CapabilitiesButton({ userId, name }: { userId: string; name: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={styles.iconBtn}
        aria-label={`Manage capabilities for ${name}`}
        title="Manage capabilities"
        onClick={() => setOpen(true)}
      >
        <Icon name="sliders-horizontal" size="sm" aria-hidden />
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        size="sm"
        title={`Capabilities for ${name}`}
      >
        <p className={styles.lede}>
          Grant this user one additional capability their role preset doesn&apos;t include. This
          does not change their role.
        </p>
        {open && <UserCapabilitiesFields userId={userId} />}
      </Dialog>
    </>
  );
}
