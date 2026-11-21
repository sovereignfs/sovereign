'use client';

import { useState } from 'react';
import { SignUpForm, type SignUpValues } from '@sovereignfs/ui';
import { signUp, signUpProblem } from '@sovereignfs/auth/client';
import type { PasswordPolicy } from '@sovereignfs/auth';
import { authClient, deriveForSignIn } from '@/lib/sign-in-client';

/** Making an account of the app's own: the design system's form and the sign-in package's flow (auth.md §7). */
export function SignUpPanel({
  returnTo,
  policy,
  hint,
}: {
  returnTo: string;
  policy: PasswordPolicy;
  hint: string;
}) {
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  async function onSubmit(values: SignUpValues) {
    setError(undefined);
    // Said at once, before anything is derived or sent.
    const problem = signUpProblem({ ...values, policy });
    if (problem) {
      setError(problem);
      return;
    }
    setPending(true);
    const result = await signUp(authClient, deriveForSignIn, { ...values, callbackURL: returnTo });
    if (result.outcome === 'signed-in') {
      window.location.assign(returnTo);
      return;
    }
    setPending(false);
    setError(
      result.outcome === 'refused'
        ? result.message
        : 'This page could not get ready. Reload it and try again.',
    );
  }

  return (
    <SignUpForm
      appName="__TITLE__"
      passwordHint={hint}
      error={error}
      pending={pending}
      onSubmit={(values) => void onSubmit(values)}
      signInHref={`/sign-in?returnTo=${encodeURIComponent(returnTo)}`}
    />
  );
}
