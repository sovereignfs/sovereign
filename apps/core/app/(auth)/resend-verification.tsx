'use client';

import { useState } from 'react';
import { Alert, Button } from '@sovereignfs/ui';
import { authClient } from '../../src/auth/client';
import { afterVerification, emailRequestProblem } from './messages';

/** Asks for a new verification link. It says the same whether or not the address has an account. */
export function ResendVerification({ email, returnTo }: { email: string; returnTo: string }) {
  const [state, setState] = useState<{ kind: 'idle' | 'sent' | 'failed'; text?: string }>({
    kind: 'idle',
  });
  const [pending, setPending] = useState(false);

  async function resend() {
    setPending(true);
    const result = await authClient.sendVerificationEmail({
      email,
      callbackURL: afterVerification(returnTo),
    });
    setPending(false);
    if (result.error) {
      setState({
        kind: 'failed',
        text: emailRequestProblem(result.error) ?? 'A new link could not be sent. Try again.',
      });
      return;
    }
    setState({ kind: 'sent' });
  }

  return (
    <>
      {state.kind === 'sent' ? (
        <Alert variant="success">A new link is on its way to {email}. It works for an hour.</Alert>
      ) : null}
      {state.kind === 'failed' ? <Alert variant="error">{state.text}</Alert> : null}
      <Button type="button" variant="secondary" loading={pending} onClick={() => void resend()}>
        {pending ? 'Sending…' : 'Send a new link'}
      </Button>
    </>
  );
}
