'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { authClient } from '@/src/auth-client';
import styles from '../auth.module.css';

type Status = 'verifying' | 'success' | 'error';

/**
 * Landing page for the emailed verification link
 * (`${AUTH_BASE_URL}/verify-email?token=...`, built in
 * `apps/auth/src/auth.ts`'s `sendVerificationEmail` callback). Consumes the
 * token client-side (JSON response, no server-side redirect) so success/error
 * states stay in React, the same pattern `reset-form.tsx` uses for password
 * reset — rather than relying on better-auth's GET-redirect-with-query-param-
 * error convention, which would lose context once forwarded through the
 * runtime's own middleware.
 */
export function VerifyForm({
  runtimeUrl,
  instanceInitial = 'S',
}: {
  runtimeUrl: string;
  instanceInitial?: string;
}) {
  const token = useSearchParams().get('token') ?? '';
  const [status, setStatus] = useState<Status>(token ? 'verifying' : 'error');
  const [errorMessage, setErrorMessage] = useState<string | null>(
    token ? null : 'No verification token found. Please use the link from your email.',
  );

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void (async () => {
      const result = await authClient.verifyEmail({ query: { token } });
      if (cancelled) return;
      if (result?.error) {
        setErrorMessage(
          result.error.code === 'TOKEN_EXPIRED' || result.error.code === 'INVALID_TOKEN'
            ? 'This link has expired or has already been used.'
            : (result.error.message ?? 'Something went wrong. Please try again.'),
        );
        setStatus('error');
        return;
      }
      setStatus('success');
      // autoSignInAfterVerification created a session — send the user
      // straight into the app rather than back to /login.
      window.location.href = runtimeUrl;
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (status === 'verifying') {
    return (
      <main className={styles.page}>
        <div className={styles.card}>
          <div className={styles.logo} aria-hidden="true">
            {instanceInitial}
          </div>
          <h1 className={styles.title}>Verifying your email…</h1>
        </div>
      </main>
    );
  }

  if (status === 'success') {
    return (
      <main className={styles.page}>
        <div className={styles.card}>
          <div className={styles.logo} aria-hidden="true">
            {instanceInitial}
          </div>
          <h1 className={styles.title}>Email verified</h1>
          <div className={styles.notice} role="status">
            <p className={styles.noticeText}>Redirecting you into Sovereign…</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo} aria-hidden="true">
          {instanceInitial}
        </div>
        <h1 className={styles.title}>Verification failed</h1>
        <p className={styles.error} style={{ marginTop: 20 }}>
          {errorMessage}
        </p>
        <p className={styles.footer}>
          Try{' '}
          <Link className={styles.link} href="/login">
            signing in
          </Link>{' '}
          again to request a new link.
        </p>
      </div>
    </main>
  );
}
