'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ResetPasswordForm as Form } from '@sovereignfs/ui';
import { resetPassword } from '@sovereignfs/auth/client';
import { authClient } from '../../../src/auth/client';
import { signInValue } from '../../../src/auth/derive';
import { withReturnTo } from '../../../src/auth/return-to';
import { newPasswordProblem, type PasswordPolicy } from '../../../src/auth/password-policy';

/** Core's new password from a reset link: the design system's form and the sign-in package's reset, with an app's request carried on. */
export function ResetPasswordForm({
  token,
  passwordHint,
  address,
  policy,
  returnTo,
}: {
  token: string;
  passwordHint: string;
  /** The account the link belongs to: the new sign-in value is made from it (core-app §5.2). */
  address: string;
  policy: PasswordPolicy;
  /** Where signing in goes next: an app's sign-in, when one led here. */
  returnTo: string;
}) {
  const [error, setError] = useState<string | undefined>();
  const [expired, setExpired] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(values: { password: string; confirm: string }) {
    // Said at once, before anything is derived or sent.
    const problem = newPasswordProblem(values.password, values.confirm, policy);
    if (problem) {
      setError(problem);
      return;
    }
    setPending(true);
    setError(undefined);
    const result = await resetPassword(authClient, signInValue, {
      ...values,
      address,
      token,
      policy,
    });
    if (result.outcome === 'done') {
      // Every session was ended, so the next step is signing in with the new password.
      window.location.assign(withReturnTo('/sign-in?reset=1', returnTo));
      return;
    }
    setPending(false);
    if (result.outcome === 'expired') setExpired(true);
    else setError(result.message);
  }

  return (
    <Form
      passwordHint={passwordHint}
      error={error}
      expired={expired}
      pending={pending}
      onSubmit={(values) => void onSubmit(values)}
      signInHref="/sign-in"
      newLinkHref={withReturnTo('/forgot-password', returnTo)}
      renderLink={({ href, ...props }) => <Link href={href} {...props} />}
    />
  );
}
