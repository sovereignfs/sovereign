'use client';

import { useState } from 'react';
import {
  ChangePasswordForm,
  LinkSovereignPanel,
  SessionsPanel,
  type LinkOutcome,
  type SessionRow,
} from '@sovereignfs/ui';
import { changePassword, linkToSovereign } from '@sovereignfs/auth/client';
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

/** Linking this account to the person's Sovereign account, after their password (auth.md §8.2); the outcome comes back in the address. */
export function LinkSovereign({
  address,
  linked,
  outcome,
}: {
  address: string;
  linked: boolean;
  outcome?: LinkOutcome | undefined;
}) {
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  async function onSubmit({ password }: { password: string }) {
    setError(undefined);
    setPending(true);
    const result = await linkToSovereign(deriveForSignIn, {
      password,
      email: address,
      returnTo: '/security',
    });
    // On success the page is on its way to Sovereign.
    if (!result.ok) {
      setPending(false);
      setError(result.message);
    }
  }

  return (
    <LinkSovereignPanel
      linked={linked}
      outcome={outcome}
      error={error}
      pending={pending}
      onSubmit={(v) => void onSubmit(v)}
    />
  );
}
