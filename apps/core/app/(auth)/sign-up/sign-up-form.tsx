'use client';

import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import { Button, Input } from '@sovereignfs/ui';
import { authClient } from '../../../src/auth/client';
import { deriveForSignIn } from '../../../src/auth/derive';
import { continuationUrl } from '../../../src/auth/oauth-continuation';
import { afterPasswordAccepted } from '../../../src/keys/session';
import type { WebKey } from '@sovereignfs/crypto/web';
import {
  newPasswordProblem,
  PAGE_NOT_READY,
  type PasswordPolicy,
} from '../../../src/auth/password-policy';
import { AuthError, AuthNotice } from '../auth-notice';
import { AuthField } from '../auth-field';
import { afterVerification } from '../messages';
import { ResendVerification } from '../resend-verification';
import styles from '../auth.module.css';

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
  const invitedEmail = invite?.email;
  const [name, setName] = useState('');
  const [email, setEmail] = useState(invitedEmail ?? '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [agreed, setAgreed] = useState(false);
  const [pending, setPending] = useState(false);
  const [waitingFor, setWaitingFor] = useState<string | undefined>();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    // The server refuses these too; this only saves the person a round trip.
    if (!agreed) {
      setError('Accept the Terms of Service and the Privacy Policy to create an account.');
      return;
    }
    const problem = newPasswordProblem(password, confirm, policy);
    if (problem) {
      setError(problem);
      return;
    }
    setPending(true);
    let value: string;
    let secret: WebKey;
    try {
      ({ signIn: value, secret } = await deriveForSignIn(password, email));
    } catch {
      setPending(false);
      setError(PAGE_NOT_READY);
      return;
    }
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const result = await authClient.signUp.email({
      name,
      email,
      password: value,
      agreedToTerms: true,
      ...(timezone ? { timezone } : {}),
      ...(invite ? { invite: invite.id } : {}),
      callbackURL: afterVerification(returnTo),
    });
    if (result.error) {
      setPending(false);
      setError(messageFor(result.error));
      return;
    }
    // No session and an address not yet verified: the next step is the inbox.
    if (!result.data?.token && !result.data?.user.emailVerified) {
      setPending(false);
      setWaitingFor(email);
      return;
    }
    // Verified by its invitation, while verification is required: better-auth opens no session at
    // sign-up then, so the person is signed in with the value just made, and goes straight on.
    if (!result.data?.token) {
      const signedIn = await authClient.signIn.email({ email, password: value });
      if (signedIn.error) {
        setPending(false);
        setError(messageFor(signedIn.error));
        return;
      }
      await afterPasswordAccepted(secret);
      window.location.assign(continuationUrl(signedIn.data) ?? returnTo);
      return;
    }
    // Signed in at once: the keys are set up now, silently (core-app §5.3).
    await afterPasswordAccepted(secret);
    // A full navigation, so the next page is rendered with the new session cookie.
    window.location.assign(returnTo);
  }

  if (waitingFor !== undefined) {
    return (
      <div className={styles.form}>
        <AuthNotice>
          We have sent a link to {waitingFor} to verify it. It works for an hour. If it does not
          arrive, check your spam folder, or ask for a new one.
        </AuthNotice>
        <ResendVerification email={waitingFor} returnTo={returnTo} />
        <p className={styles.footer}>
          <Link className={styles.link} href={`/sign-in?returnTo=${encodeURIComponent(returnTo)}`}>
            Back to sign in
          </Link>
        </p>
      </div>
    );
  }

  const invited = invitedEmail !== undefined;

  return (
    <>
      {invited ? (
        <div className={styles.notice}>
          <p className={styles.inviteTitle}>Invited to join {instanceName}</p>
        </div>
      ) : null}
      <form className={styles.form} onSubmit={(event) => void onSubmit(event)}>
        <AuthField label="Name">
          {(control) => (
            <Input
              {...control}
              name="name"
              autoComplete="name"
              required
              disabled={pending}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          )}
        </AuthField>
        <AuthField
          label="Email"
          aside={invited ? <span className={styles.fromInvite}>from invite</span> : undefined}
        >
          {(control) => (
            <Input
              {...control}
              type="email"
              name="email"
              autoComplete="username"
              required
              disabled={pending}
              readOnly={invited}
              value={email}
              onChange={invited ? undefined : (event) => setEmail(event.target.value)}
            />
          )}
        </AuthField>
        <AuthField label="Password" hint={passwordHint}>
          {(control) => (
            <Input
              {...control}
              type="password"
              name="password"
              autoComplete="new-password"
              required
              disabled={pending}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          )}
        </AuthField>
        <AuthField label="Confirm password">
          {(control) => (
            <Input
              {...control}
              type="password"
              name="confirm"
              autoComplete="new-password"
              required
              disabled={pending}
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
            />
          )}
        </AuthField>
        <label className={styles.terms}>
          <input
            type="checkbox"
            name="agreedToTerms"
            disabled={pending}
            checked={agreed}
            onChange={(event) => setAgreed(event.target.checked)}
          />
          <span>
            I agree to the{' '}
            <Link href="/privacy" className={styles.link} target="_blank" rel="noopener noreferrer">
              Privacy Policy
            </Link>{' '}
            and{' '}
            <Link href="/tos" className={styles.link} target="_blank" rel="noopener noreferrer">
              Terms of Service
            </Link>
          </span>
        </label>
        {error ? <AuthError>{error}</AuthError> : null}
        <Button type="submit" className={styles.submit} loading={pending}>
          {pending
            ? invited
              ? 'Accepting…'
              : 'Creating account…'
            : invited
              ? 'Accept invitation'
              : 'Create account'}
        </Button>
      </form>
      <p className={styles.footer}>
        Already have an account?{' '}
        <Link className={styles.link} href={`/sign-in?returnTo=${encodeURIComponent(returnTo)}`}>
          Sign in
        </Link>
      </p>
    </>
  );
}

/** What went wrong, in words a person can act on. The server's password message is already that. */
function messageFor(error: { status: number; code?: string; message?: string }): string {
  if (error.status === 429) return 'Too many attempts. Wait a minute, then try again.';
  if (error.code === 'EMAIL_NOT_AVAILABLE') {
    return "Email isn't set up on this instance, so accounts can't be verified yet. Ask whoever runs it.";
  }
  if (error.code === 'INVITE_REQUIRED')
    return 'There is no valid invitation for this email address. Ask whoever runs this instance to invite you.';
  if (error.code === 'PASSWORD_DOES_NOT_MEET_POLICY' && error.message) return error.message;
  if (error.code === 'TERMS_NOT_ACCEPTED' && error.message) return error.message;
  if (error.code === 'INVALID_TIMEZONE') {
    return 'Your browser reported a time zone this instance does not recognise. Try again in another browser.';
  }
  if (error.code === 'USER_ALREADY_EXISTS' || error.code?.startsWith('USER_ALREADY_EXISTS'))
    return 'An account with this email address already exists. Try signing in instead.';
  if (error.code === 'INVALID_EMAIL') return 'Enter a valid email address.';
  return 'The account could not be created. Check what you entered and try again.';
}
