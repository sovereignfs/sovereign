'use client';

import { useState } from 'react';
import { Button } from '@sovereignfs/ui';
import { authClient } from '../src/auth/client';

export function SignOutButton() {
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    await authClient.signOut();
    window.location.assign('/sign-in?signedout=1');
  }

  return (
    <Button variant="secondary" loading={pending} onClick={() => void signOut()}>
      Sign out
    </Button>
  );
}
