'use client';

import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import { Alert, Button, Checkbox, FormField, Input, LegalLinks } from '@sovereignfs/ui';
import { authClient } from '../../../src/auth/client';
import { afterVerification } from '../messages';
import { ResendVerification } from '../resend-verification';
import styles from '../auth.module.css';

export function SignUpForm({ returnTo, passwordHint }: { returnTo: string; passwordHint: string }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [agreed, setAgreed] = useState(false);
  const [pending, setPending] = useState(false);
  const [waitingFor, setWaitingFor] = useState<string | undefined>();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    // The server refuses it too; this only saves the person a round trip.
    if (!agreed) {
      setError('Accept the Terms of Service and the Privacy Policy to create an account.');
      return;
    }
    setPending(true);
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const result = await authClient.signUp.email({
      name,
      email,
      password,
      agreedToTerms: true,
      ...(timezone ? { timezone } : {}),
      callbackURL: afterVerification(returnTo),
    });
    if (result.error) {
      setPending(false);
      setError(messageFor(result.error));
      return;
    }
    // No session means the address has to be verified first: the next step is the inbox.
    if (!result.data?.token) {
      setPending(false);
      setWaitingFor(email);
      return;
    }
    // A full navigation, so the next page is rendered with the new session cookie.
    window.location.assign(returnTo);
  }

  if (waitingFor !== undefined) {
    return (
      <div className={styles.form}>
        <Alert variant="info">
          We have sent a link to {waitingFor} to verify it. It works for an hour. If it does not
          arrive, check your spam folder, or ask for a new one.
        </Alert>
        <ResendVerification email={waitingFor} returnTo={returnTo} />
        <p className={styles.footer}>
          <Link className={styles.link} href={`/sign-in?returnTo=${encodeURIComponent(returnTo)}`}>
            Back to sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form className={styles.form} onSubmit={(event) => void onSubmit(event)}>
      {error ? <Alert variant="error">{error}</Alert> : null}
      <FormField label="Name" required>
        {(field) => (
          <Input
            {...field}
            name="name"
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        )}
      </FormField>
      <FormField label="Email" required>
        {(field) => (
          <Input
            {...field}
            type="email"
            name="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        )}
      </FormField>
      <FormField label="Password" hint={passwordHint} required>
        {(field) => (
          <Input
            {...field}
            type="password"
            name="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        )}
      </FormField>
      <div className={styles.terms}>
        <Checkbox
          checked={agreed}
          onChange={setAgreed}
          label="I agree to the Terms of Service and the Privacy Policy"
          name="agreedToTerms"
        />
        <LegalLinks
          renderLink={(href, label) => (
            <a className={styles.link} href={href} target="_blank" rel="noopener noreferrer">
              {label}
            </a>
          )}
        />
      </div>
      <Button type="submit" className={styles.submit} loading={pending}>
        {pending ? 'Creating account…' : 'Create account'}
      </Button>
      <p className={styles.footer}>
        Already have an account?{' '}
        <Link className={styles.link} href={`/sign-in?returnTo=${encodeURIComponent(returnTo)}`}>
          Sign in
        </Link>
      </p>
    </form>
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
