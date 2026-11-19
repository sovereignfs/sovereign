'use client';

import { useState } from 'react';
import { ChangePasswordForm as Form } from '@sovereignfs/ui';
import { changePassword } from '@sovereignfs/auth/client';
import { authClient } from '../../src/auth/client';
import { deriveForSignIn } from '../../src/auth/derive';
import { afterPasswordChange, beforePasswordChange } from '../../src/keys/session';
import { newPasswordProblem, type PasswordPolicy } from '../../src/auth/password-policy';

/**
 * Changing the password: the design system's form and the sign-in package's change, with core's key store, so the keys never stop
 * opening with whichever password the account has (core-app §5.3).
 */
export function ChangePasswordForm({
  address,
  policy,
}: {
  /** The account's address, which both values are made from (core-app §5.2). */
  address: string;
  policy: PasswordPolicy;
}) {
  const [error, setError] = useState<string | undefined>();
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(values: { current: string; next: string }) {
    setError(undefined);
    setDone(false);
    // Said at once, before anything is derived or sent.
    const problem = newPasswordProblem(values.next, undefined, policy);
    if (problem) {
      setError(problem);
      return;
    }
    setPending(true);
    const result = await changePassword(
      authClient,
      deriveForSignIn,
      { ...values, address },
      { before: beforePasswordChange, after: afterPasswordChange },
    );
    setPending(false);
    if (!result.changed) {
      setError(result.message);
      return;
    }
    setDone(true);
  }

  return <Form error={error} done={done} pending={pending} onSubmit={(v) => void onSubmit(v)} />;
}
