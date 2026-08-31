'use client';

import { useState } from 'react';
import { Dialog } from '@sovereignfs/ui';
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
        title="Manage capabilities"
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
          <path d="M12 2l3 6 6 1-4.5 4.5L18 20l-6-3-6 3 1.5-6.5L3 9l6-1z" />
        </svg>
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
