import { useState, type FormEvent } from 'react';
import { Input } from '../Input/Input';
import { AuthField } from './AuthField';
import { AuthButton, AuthFooter, AuthForm } from './AuthForm';
import { AuthError, AuthNotice } from './AuthNotice';
import { plainLink, type AuthLinkRenderer } from './AuthLinkRenderer';
import styles from './Auth.module.css';

export interface ForgotPasswordFormProps {
  /** The address the link went to, once it has: the form gives way to what was sent. */
  sentTo?: string | undefined;
  error?: string | undefined;
  pending?: boolean;
  /** The address, once the person submits it. The form never sends anything itself. */
  onSubmit: (email: string) => void;
  signInHref: string;
  renderLink?: AuthLinkRenderer;
}

/**
 * Asking for a link to reset the password (auth.md §7), for core and every app. What it says once sent is the same whether or not the
 * address has an account.
 */
export function ForgotPasswordForm({
  sentTo,
  error,
  pending = false,
  onSubmit,
  signInHref,
  renderLink = plainLink,
}: ForgotPasswordFormProps) {
  const [email, setEmail] = useState('');
  const back = (
    <AuthFooter>
      {renderLink({ href: signInHref, className: styles.link, children: 'Back to sign in' })}
    </AuthFooter>
  );

  if (sentTo !== undefined) {
    return (
      <>
        <AuthNotice>
          If {sentTo} has an account, a link to reset the password is on its way. It works for an
          hour.
        </AuthNotice>
        {back}
      </>
    );
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(email);
  }

  return (
    <>
      <AuthForm onSubmit={submit}>
        <AuthField label="Email address">
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
        {error ? <AuthError>{error}</AuthError> : null}
        <AuthButton type="submit" loading={pending}>
          {pending ? 'Sending…' : 'Send reset link'}
        </AuthButton>
      </AuthForm>
      {back}
    </>
  );
}
