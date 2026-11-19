'use client';

import { useState } from 'react';
import { Button } from '@sovereignfs/ui';
import { authClient } from '../../../../src/auth/client';
import { forgetKeys } from '../../../../src/keys/session';
import { AuthError } from '../../auth-notice';
import styles from '../../auth.module.css';

/**
 * Signs out, then opens the invitation link again, which goes on to sign-up now that nobody is signed in. If signing out does not
 * go through, the person is told and stays, as the account menu does.
 */
export function SignOutToUse({ inviteId }: { inviteId: string }) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signOutAndUse() {
    setPending(true);
    setFailed(false);
    await forgetKeys();
    const ended = await authClient.signOut().then(
      (result) => !result.error,
      () => false,
    );
    if (!ended) {
      setPending(false);
      setFailed(true);
      return;
    }
    window.location.assign(`/invite/${encodeURIComponent(inviteId)}`);
  }

  return (
    <>
      {failed ? (
        <AuthError>You are still signed in: signing out did not go through. Try again.</AuthError>
      ) : null}
      <Button
        variant="secondary"
        className={styles.wide}
        loading={pending}
        onClick={() => void signOutAndUse()}
      >
        Sign out and use the invitation
      </Button>
    </>
  );
}
