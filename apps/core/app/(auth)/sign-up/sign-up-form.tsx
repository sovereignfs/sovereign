'use client';

import Link from 'next/link';
import { useState } from 'react';
import { SignUpForm as Form, type SignUpValues } from '@sovereignfs/ui';
import { signUp, signUpProblem } from '@sovereignfs/auth/client';
import { authClient } from '../../../src/auth/client';
import { deriveForSignIn } from '../../../src/auth/derive';
import { continuationUrl } from '../../../src/auth/oauth-continuation';
import { afterPasswordAccepted } from '../../../src/keys/session';
import { PAGE_NOT_READY, type PasswordPolicy } from '../../../src/auth/password-policy';
import { afterVerification } from '../messages';
import { ResendVerification } from '../resend-verification';

/**
 * Core's sign-up: the design system's form (`SignUpForm`) and the sign-in package's flow (`signUp`), with what is core's: the terms,
 * an invitation's id, an app's sign-in carried on, and the person's keys set up.
 */
export function SignUpForm({
  returnTo,
  passwordHint,
  policy,
  instanceName,
  invite,
}: {
  returnTo: string;
  passwordHint: string;
  /** Held here, since the server never sees the password to check it (core-app §5.2). */
  policy: PasswordPolicy;
  instanceName: string;
  /**
   * The invitation link this page was opened from: the field starts with its address, and its id goes with
   * the sign-up, so an address the invitation was emailed to needs no second email (core-app §3.3.3).
   */
  invite?: { id: string; email: string } | undefined;
}) {
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);
  const [waitingFor, setWaitingFor] = useState<string | undefined>();

  async function onSubmit(values: SignUpValues) {
    setError(undefined);
    // The server refuses these too; this only saves the person a round trip.
    const problem = signUpProblem({ ...values, policy });
    if (problem) {
      setError(problem);
      return;
    }
    setPending(true);
    const result = await signUp(
      authClient,
      deriveForSignIn,
      { ...values, callbackURL: afterVerification(returnTo) },
      { agreedToTerms: true, ...(invite ? { invite: invite.id } : {}) },
    );
    if (result.outcome === 'not-ready' || result.outcome === 'refused') {
      setPending(false);
      setError(result.outcome === 'not-ready' ? PAGE_NOT_READY : result.message);
      return;
    }
    if (result.outcome === 'waiting') {
      setPending(false);
      setWaitingFor(values.email);
      return;
    }
    // Signed in: the keys are set up now, silently (core-app §5.3).
    await afterPasswordAccepted(result.secret);
    // A full navigation, so the next page is rendered with the new session cookie; an app's sign-in carries on.
    window.location.assign(
      (result.data === undefined ? undefined : continuationUrl(result.data)) ?? returnTo,
    );
  }

  return (
    <Form
      appName={instanceName}
      passwordHint={passwordHint}
      invitedEmail={invite?.email}
      terms={{ privacyHref: '/privacy', tosHref: '/tos' }}
      error={error}
      pending={pending}
      waitingFor={waitingFor}
      renderWaiting={(email) => <ResendVerification email={email} returnTo={returnTo} />}
      onSubmit={(values) => void onSubmit(values)}
      signInHref={`/sign-in?returnTo=${encodeURIComponent(returnTo)}`}
      renderLink={({ href, ...props }) => <Link href={href} {...props} />}
    />
  );
}
