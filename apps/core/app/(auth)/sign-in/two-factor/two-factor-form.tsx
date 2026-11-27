'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { TwoFactorForm as Form } from '@sovereignfs/ui';
import { verifySecondStep } from '@sovereignfs/auth/client';
import { authClient } from '../../../../src/auth/client';
import { afterSigningIn } from '../../../../src/keys/kit-step';
import { afterSecondStep, dropHandOver } from '../../../../src/keys/session';
import {
  continuationUrl,
  isContinuation,
  isExpiredRequest,
} from '../../../../src/auth/oauth-continuation';
import { ExpiredRequest } from '../../expired-request';
import { passkeyProblem } from '../../messages';
import { signInWithPasskey as passkeySignIn } from '../../passkey-sign-in';

/**
 * Core's second sign-in step: the design system's form (`TwoFactorForm`) and the sign-in package's check (`verifySecondStep`), with
 * what is core's: an app's sign-in carried on, and the person's keys opened with the password the first step accepted.
 */
export function TwoFactorForm({ returnTo }: { returnTo: string }) {
  const [error, setError] = useState<string | undefined>();
  /** The sign-in this step belongs to cannot go on: only signing in again helps. */
  const [over, setOver] = useState(false);
  // The app's signed request ran out while the page was open: its sign-in starts again (`ExpiredRequest`).
  const [expired, setExpired] = useState(false);
  const [pending, setPending] = useState(false);
  // An app's request, when it sent the person here: sign-in starts again with it, not without. Known only
  // in the browser, so it is read after the first render, never during it.
  const [request, setRequest] = useState('');
  const [passkeysSupported, setPasskeysSupported] = useState(false);
  const [passkeyPending, setPasskeyPending] = useState(false);
  useEffect(() => {
    if (isContinuation(window.location.search)) setRequest(window.location.search);
    setPasskeysSupported(typeof window.PublicKeyCredential === 'function');
  }, []);
  const signInAgain =
    request === '' ? `/sign-in?returnTo=${encodeURIComponent(returnTo)}` : `/sign-in${request}`;

  async function onSubmit(values: { code: string; backup: boolean }) {
    setPending(true);
    setError(undefined);
    const result = await verifySecondStep(authClient, values, isExpiredRequest);
    if (result.outcome !== 'signed-in') {
      setPending(false);
      if (result.outcome === 'other') setExpired(true);
      else if (result.outcome === 'over') setOver(true);
      else setError(result.message);
      return;
    }
    // The password the first step accepted left its secret: the keys are opened with it now (core-app §5.3).
    await afterSecondStep();
    // A full navigation, so the next page is rendered with the new session cookie. An app's sign-in goes
    // back to the app.
    window.location.assign(await afterSigningIn(returnTo, continuationUrl(result.data)));
  }

  async function signInWithPasskey() {
    setPasskeyPending(true);
    setError(undefined);
    // As on the sign-in page: the same touch unlocks the keys, when the passkey can (core-app §5.5).
    const result = await passkeySignIn();
    if (result.error) {
      setPasskeyPending(false);
      if (isExpiredRequest(result.error)) setExpired(true);
      else setError(passkeyProblem(result.error));
      return;
    }
    // The password's secret is not used: a passkey is a sign-in of its own, and may be another account's,
    // whose keys that secret must never set up or open.
    await dropHandOver();
    window.location.assign(await afterSigningIn(returnTo, continuationUrl(result.data)));
  }

  if (expired) return <ExpiredRequest restartAt={returnTo} />;

  return (
    <Form
      error={error}
      pending={pending}
      over={over}
      passkey={
        passkeysSupported
          ? { pending: passkeyPending, onClick: () => void signInWithPasskey() }
          : undefined
      }
      onSubmit={(values) => void onSubmit(values)}
      onModeChange={() => setError(undefined)}
      signInAgainHref={signInAgain}
      renderLink={({ href, ...props }) => <Link href={href} {...props} />}
    />
  );
}
