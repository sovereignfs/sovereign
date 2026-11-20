'use client';

import { useState } from 'react';
import { ChangePasswordForm, SessionsPanel, type SessionRow } from '@sovereignfs/ui';
import { changePassword } from '@sovereignfs/auth/client';
import { newPasswordProblem, type PasswordPolicy } from '@sovereignfs/auth';
import { authClient, deriveForSignIn } from '@/lib/sign-in-client';
import { endOtherSessionsAction, endSessionAction } from './actions';

/** Changing the password: both are sent as sign-in values made with the account's address, and every other session ends. */
export function Password({ address, policy }: { address: string; policy: PasswordPolicy }) {
  const [error, setError] = useState<string | undefined>();
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(values: { current: string; next: string }) {
    setError(undefined);
    setDone(false);
    const problem = newPasswordProblem(values.next, undefined, policy);
    if (problem) {
      setError(problem);
      return;
    }
    setPending(true);
    const result = await changePassword(authClient, deriveForSignIn, { ...values, address });
    setPending(false);
    if (!result.changed) setError(result.message);
    else setDone(true);
  }

  return (
    <ChangePasswordForm
      error={error}
      done={done}
      pending={pending}
      onSubmit={(v) => void onSubmit(v)}
    />
  );
}

/** The person's sessions, each ended by this app's server action. */
export function Sessions({ sessions }: { sessions: SessionRow[] }) {
  return (
    <SessionsPanel
      sessions={sessions}
      endSession={endSessionAction}
      endOthers={endOtherSessionsAction}
    />
  );
}
