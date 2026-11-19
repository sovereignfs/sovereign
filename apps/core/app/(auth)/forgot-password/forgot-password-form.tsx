'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ForgotPasswordForm as Form } from '@sovereignfs/ui';
import { requestPasswordReset } from '@sovereignfs/auth/client';
import { authClient } from '../../../src/auth/client';
import { withReturnTo } from '../../../src/auth/return-to';

/** Core's request for a reset link: the design system's form and the sign-in package's request, with an app's request carried along. */
export function ForgotPasswordForm({ returnTo }: { returnTo: string }) {
  const [error, setError] = useState<string | undefined>();
  const [sentTo, setSentTo] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  async function onSubmit(email: string) {
    setPending(true);
    setError(undefined);
    const result = await requestPasswordReset(authClient, {
      email,
      redirectTo: withReturnTo('/reset-password', returnTo),
    });
    setPending(false);
    if (!result.sent) {
      setError(result.message);
      return;
    }
    // The same words whether or not the address has an account.
    setSentTo(email);
  }

  return (
    <Form
      sentTo={sentTo}
      error={error}
      pending={pending}
      onSubmit={(email) => void onSubmit(email)}
      signInHref={withReturnTo('/sign-in', returnTo)}
      renderLink={({ href, ...props }) => <Link href={href} {...props} />}
    />
  );
}
