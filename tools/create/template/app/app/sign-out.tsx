'use client';

import type { ReactNode } from 'react';
import { turnOffPush } from '@sovereignfs/pwa/client';
import { signOut } from './actions';

/** Signing out turns this device's notifications off first, so the next person to use it is not sent the last one's. */
export function SignOutForm({ children }: { children: ReactNode }) {
  return (
    <form
      action={async () => {
        await turnOffPush();
        await signOut();
      }}
    >
      {children}
    </form>
  );
}
