import { useState, type FormEvent, type ReactNode } from 'react';
import { plainLink, type AuthLinkRenderer } from './AuthLinkRenderer';

export type { AuthLinkRenderer };
import { Input } from '../Input/Input';
import { AuthField } from './AuthField';
import { AuthButton, AuthDivider, AuthFooter, AuthForm } from './AuthForm';
import { AuthError, AuthNotice } from './AuthNotice';
import styles from './Auth.module.css';

export interface SignInFormProps {
  /** The app's name, for "New to … ?". */
  appName: string;
  /** What the person arrived to be told (signed out, a link that did not work), above the form. */
  notice?: ReactNode;
  /** What went wrong with the last attempt, in one sentence. */
  error?: string | undefined;
  /** The address must be verified before signing in: what to show, with the address typed (a way to send the link again). */
  renderUnverified?: ((email: string) => ReactNode) | undefined;
  /** Whether that is the case now. */
  unverified?: boolean;
  /** A sign-in is under way: the boxes are off and the button says so. */
  pending?: boolean;
  /** Signing in with a passkey, when the browser offers one. Leave out to offer none. */
  passkey?: { pending: boolean; onClick: () => void } | undefined;
  /** The email and password, once the person submits them. The form never sends anything itself. */
  onSubmit: (values: { email: string; password: string }) => void;
  forgotPasswordHref: string;
  /** Where to create an account. Leave out where nobody may. */
  signUpHref?: string | undefined;
  renderLink?: AuthLinkRenderer;
}

/**
 * The sign-in form of core and every app (auth.md §7): an email, a password, a passkey if the browser has one, and a way to create an
 * account. It draws and collects; the consumer signs in (`@sovereignfs/auth/client`) and says what happened through its props.
 */
export function SignInForm({
  appName,
  notice,
  error,
  renderUnverified,
  unverified = false,
  pending = false,
  passkey,
  onSubmit,
  forgotPasswordHref,
  signUpHref,
  renderLink = plainLink,
}: SignInFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit({ email, password });
  }

  return (
    <>
      {notice}
      <AuthForm onSubmit={submit}>
        <AuthField label="Email">
          {(control) => (
            <Input
              {...control}
              type="email"
              name="email"
              autoComplete="username"
              required
              disabled={pending}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          )}
        </AuthField>
        <AuthField
          label="Password"
          aside={renderLink({ href: forgotPasswordHref, children: 'Forgot password?' })}
        >
          {(control) => (
            <Input
              {...control}
              type="password"
              name="password"
              autoComplete="current-password"
              required
              disabled={pending}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          )}
        </AuthField>
        {error ? <AuthError>{error}</AuthError> : null}
        {unverified ? (
          <>
            <AuthNotice tone="warning">
              Verify your email address before signing in: follow the link we sent when you made the
              account.
            </AuthNotice>
            {renderUnverified?.(email)}
          </>
        ) : null}
        <AuthButton type="submit" loading={pending}>
          {pending ? 'Signing in…' : 'Sign in'}
        </AuthButton>
      </AuthForm>
      {passkey ? (
        <>
          <AuthDivider />
          <AuthButton variant="secondary" loading={passkey.pending} onClick={passkey.onClick}>
            {passkey.pending ? 'Waiting for your device…' : 'Sign in with a passkey'}
          </AuthButton>
        </>
      ) : null}
      {signUpHref ? (
        <AuthFooter>
          New to {appName}?{' '}
          {renderLink({ href: signUpHref, className: styles.link, children: 'Create account' })}
        </AuthFooter>
      ) : null}
    </>
  );
}
