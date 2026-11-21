import { useState, type FormEvent, type ReactNode } from 'react';
import { Input } from '../Input/Input';
import { AuthField } from './AuthField';
import { AuthButton, AuthFooter, AuthForm } from './AuthForm';
import { AuthError, AuthNotice } from './AuthNotice';
import { plainLink, type AuthLinkRenderer } from './AuthLinkRenderer';
import styles from './Auth.module.css';

/** What a sign-up hands over. */
export interface SignUpValues {
  name: string;
  email: string;
  password: string;
  confirm: string;
  /** Whether the box accepting the terms is ticked; `true` where the app asks for none. */
  agreed: boolean;
}

export interface SignUpFormProps {
  appName: string;
  /** The password policy in one sentence, under the box. */
  passwordHint: string;
  /** The address of the invitation the page was opened from: the box starts with it and cannot be changed. */
  invitedEmail?: string | undefined;
  /** The privacy policy and terms to accept, as a box to tick. `false` for an app that has none. */
  terms?: { privacyHref: string; tosHref: string } | false;
  error?: string | undefined;
  pending?: boolean;
  /** The address a verification link went to: the form gives way to waiting for it. */
  waitingFor?: string | undefined;
  /** While waiting: a way to send the link again, for that address. */
  renderWaiting?: ((email: string) => ReactNode) | undefined;
  /** What the person typed, once they submit it. The form never sends anything itself. */
  onSubmit: (values: SignUpValues) => void;
  signInHref: string;
  renderLink?: AuthLinkRenderer;
}

/**
 * Creating an account (auth.md §7), for core and every app: a name, the address (an invitation's, when there is one), the password
 * typed twice, and the terms when the app has them. Once a verification link is sent, it says so and waits.
 */
export function SignUpForm({
  appName,
  passwordHint,
  invitedEmail,
  terms = false,
  error,
  pending = false,
  waitingFor,
  renderWaiting,
  onSubmit,
  signInHref,
  renderLink = plainLink,
}: SignUpFormProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState(invitedEmail ?? '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [agreed, setAgreed] = useState(false);
  const invited = invitedEmail !== undefined;
  const signIn = renderLink({
    href: signInHref,
    className: styles.link,
    children: 'Back to sign in',
  });

  if (waitingFor !== undefined) {
    return (
      <div className={styles.form}>
        <AuthNotice>
          We have sent a link to {waitingFor} to verify it. It works for an hour. If it does not
          arrive, check your spam folder, or ask for a new one.
        </AuthNotice>
        {renderWaiting?.(waitingFor)}
        <AuthFooter>{signIn}</AuthFooter>
      </div>
    );
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit({ name, email, password, confirm, agreed: terms === false || agreed });
  }

  return (
    <>
      {invited ? (
        <div className={styles.notice}>
          <p className={styles.inviteTitle}>Invited to join {appName}</p>
        </div>
      ) : null}
      <AuthForm onSubmit={submit}>
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
        {terms ? (
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
              {renderLink({
                href: terms.privacyHref,
                className: styles.link,
                target: '_blank',
                rel: 'noopener noreferrer',
                children: 'Privacy Policy',
              })}{' '}
              and{' '}
              {renderLink({
                href: terms.tosHref,
                className: styles.link,
                target: '_blank',
                rel: 'noopener noreferrer',
                children: 'Terms of Service',
              })}
            </span>
          </label>
        ) : null}
        {error ? <AuthError>{error}</AuthError> : null}
        <AuthButton type="submit" loading={pending}>
          {pending
            ? invited
              ? 'Accepting…'
              : 'Creating account…'
            : invited
              ? 'Accept invitation'
              : 'Create account'}
        </AuthButton>
      </AuthForm>
      <AuthFooter>
        Already have an account?{' '}
        {renderLink({ href: signInHref, className: styles.link, children: 'Sign in' })}
      </AuthFooter>
    </>
  );
}
