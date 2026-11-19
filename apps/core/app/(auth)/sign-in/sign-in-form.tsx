'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { SignInForm as Form } from '@sovereignfs/ui';
import { signInWithPassword } from '@sovereignfs/auth/client';
import { authClient } from '../../../src/auth/client';
import { deriveForSignIn } from '../../../src/auth/derive';
import { afterPasswordAccepted, startAfresh, handOverSecret } from '../../../src/keys/session';
import {
  continuationUrl,
  isContinuation,
  isExpiredRequest,
} from '../../../src/auth/oauth-continuation';
import { ExpiredRequest } from '../expired-request';
import { withReturnTo } from '../../../src/auth/return-to';
import { passkeyProblem } from '../messages';
import { signInWithPasskey as passkeySignIn } from '../passkey-sign-in';
import { AuthNotice } from '../auth-notice';
import { ResendVerification } from '../resend-verification';

/** Something the person arrived to be told: they signed out, changed their password, or a link did not work. */
export type SignInNotice = 'password-changed' | 'link-invalid' | 'account-deleted' | 'signed-out';

/** The notice for each, above the form. */
function noticeFor(notice: SignInNotice | undefined) {
  if (notice === 'signed-out') return <AuthNotice>You’ve been signed out.</AuthNotice>;
  if (notice === 'password-changed') {
    return <AuthNotice>Your password is changed. Sign in with the new one.</AuthNotice>;
  }
  if (notice === 'account-deleted') {
    return <AuthNotice>Your account is deleted. Nothing of it is kept.</AuthNotice>;
  }
  if (notice === 'link-invalid') {
    return (
      <AuthNotice tone="warning">
        That link has expired or was already used. Sign in, and we can send you a new one.
      </AuthNotice>
    );
  }
  return null;
}

/**
 * Core's sign-in: the design system's form (`SignInForm`) and the sign-in package's flow (`signInWithPassword`), with what is core's
 * around them: an app's sign-in request carried through, and the person's keys opened.
 */
export function SignInForm({
  returnTo,
  notice,
  instanceName,
}: {
  returnTo: string;
  notice?: SignInNotice;
  instanceName: string;
}) {
  const [error, setError] = useState<string | undefined>();
  const [unverified, setUnverified] = useState(false);
  // Known only in the browser, so it is read after the first render, never during it.
  const [passkeysSupported, setPasskeysSupported] = useState(false);
  const [passkeyPending, setPasskeyPending] = useState(false);
  const [pending, setPending] = useState(false);
  // The app's signed request ran out while the page was open: its sign-in starts again (`ExpiredRequest`).
  const [expired, setExpired] = useState(false);

  useEffect(() => setPasskeysSupported(typeof window.PublicKeyCredential === 'function'), []);
  // A sign-in starts afresh: a password's secret left waiting for a second step is dropped, and with no session, kept keys too.
  useEffect(() => void startAfresh(), []);

  async function signInWithPasskey() {
    setPasskeyPending(true);
    setError(undefined);
    setUnverified(false);
    const result = await passkeySignIn();
    if (result.error) {
      setPasskeyPending(false);
      if (isExpiredRequest(result.error)) setExpired(true);
      else setError(passkeyProblem(result.error));
      return;
    }
    // A full navigation, so the next page is rendered with the new session cookie. An app's sign-in goes
    // back to the app; anything else goes where the person was headed.
    window.location.assign(continuationUrl(result.data) ?? returnTo);
  }

  async function onSubmit(values: { email: string; password: string }) {
    setPending(true);
    setError(undefined);
    setUnverified(false);
    // The password never leaves the browser: what is sent is made from it (core-app §5.2).
    const result = await signInWithPassword(
      authClient as never,
      deriveForSignIn,
      values,
      isExpiredRequest,
    );
    switch (result.outcome) {
      case 'not-ready':
        setPending(false);
        setError('This page could not get ready to sign you in. Reload it and try again.');
        return;
      case 'other':
        setPending(false);
        setExpired(true);
        return;
      case 'unverified':
        setPending(false);
        setUnverified(true);
        return;
      case 'refused':
        setPending(false);
        setError(result.message);
        return;
      case 'second-step': {
        // The password's secret waits for the second step, which unlocks the person's keys with it (core-app §5.3).
        await handOverSecret(result.secret);
        // An app's request goes along, so the second step can carry on with it.
        const search = window.location.search;
        window.location.assign(
          isContinuation(search)
            ? `/sign-in/two-factor${search}`
            : `/sign-in/two-factor?returnTo=${encodeURIComponent(returnTo)}`,
        );
        return;
      }
      case 'signed-in':
        // The keys are set up the first time, or opened, silently (core-app §5.3); nothing about them stops signing in.
        await afterPasswordAccepted(result.secret);
        // A full navigation, so the next page is rendered with the new session cookie.
        window.location.assign(continuationUrl(result.data) ?? returnTo);
    }
  }

  if (expired) return <ExpiredRequest restartAt={returnTo} />;

  return (
    <Form
      appName={instanceName}
      notice={noticeFor(notice)}
      error={error}
      unverified={unverified}
      renderUnverified={(email) => <ResendVerification email={email} returnTo={returnTo} />}
      pending={pending}
      passkey={
        passkeysSupported
          ? { pending: passkeyPending, onClick: () => void signInWithPasskey() }
          : undefined
      }
      onSubmit={(values) => void onSubmit(values)}
      forgotPasswordHref={withReturnTo('/forgot-password', returnTo)}
      signUpHref={`/sign-up?returnTo=${encodeURIComponent(returnTo)}`}
      renderLink={({ href, ...props }) => <Link href={href} {...props} />}
    />
  );
}
