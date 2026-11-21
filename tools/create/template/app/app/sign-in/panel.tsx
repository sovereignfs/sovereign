'use client';

import { useState } from 'react';
import { AuthError, AuthNotice, ButtonLink, SignInForm } from '@sovereignfs/ui';
import { signInWithPassword } from '@sovereignfs/auth/client';
import { authClient, deriveForSignIn } from '@/lib/sign-in-client';

/**
 * The sign-in: the design system's form and the sign-in package's flow (auth.md §7), with "Continue with Sovereign" when the app signs
 * in through core. The password never leaves the browser: what is sent is the sign-in value made from it.
 */
export function SignInPanel({
  returnTo,
  local,
  core,
  signUp,
  problem,
}: {
  returnTo: string;
  local: boolean;
  core: boolean;
  signUp: boolean;
  problem: string | undefined;
}) {
  const [error, setError] = useState(problem);
  const [pending, setPending] = useState(false);
  const throughCore = core ? (
    <ButtonLink
      href={`/api/auth/sign-in/sovereign?returnTo=${encodeURIComponent(returnTo)}`}
      variant="secondary"
    >
      Continue with Sovereign
    </ButtonLink>
  ) : null;

  async function onSubmit(values: { email: string; password: string }) {
    setPending(true);
    setError(undefined);
    const result = await signInWithPassword(authClient, deriveForSignIn, values);
    if (result.outcome === 'signed-in') {
      // A full navigation, so the next page is rendered with the new session cookie.
      window.location.assign(returnTo);
      return;
    }
    setPending(false);
    if (result.outcome === 'refused') setError(result.message);
    else if (result.outcome === 'not-ready')
      setError('This page could not get ready. Reload it and try again.');
    // This app offers no second step and verifies no address, so neither is asked of an account of its own.
    else setError('Signing in did not work. Try again.');
  }

  if (!local) {
    return (
      <>
        {error ? <AuthError>{error}</AuthError> : null}
        {throughCore ?? <AuthNotice tone="warning">This app has no way to sign in.</AuthNotice>}
      </>
    );
  }
  return (
    <SignInForm
      appName="__TITLE__"
      error={error}
      pending={pending}
      onSubmit={(values) => void onSubmit(values)}
      otherWays={throughCore}
      signUpHref={signUp ? `/sign-up?returnTo=${encodeURIComponent(returnTo)}` : undefined}
    />
  );
}
