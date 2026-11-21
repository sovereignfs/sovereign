'use client';

import type { FormEvent, ReactNode } from 'react';
import { turnOffPush } from '@sovereignfs/pwa/client';

/**
 * Signing out turns this device's notifications off first, so the next person to use it is not sent the last one's; then the form is
 * sent as it is, to the SDK's sign-out.
 */
export function SignOutForm({ children }: { children: ReactNode }) {
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    void turnOffPush().finally(() => form.submit());
  };
  return (
    <form action="/auth/logout" method="post" onSubmit={onSubmit}>
      {children}
    </form>
  );
}
