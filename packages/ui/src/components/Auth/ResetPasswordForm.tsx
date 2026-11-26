import type { FormEvent } from 'react';
import { Input } from '../Input/Input';
import { AuthField } from './AuthField';
import { AuthButton, AuthFooter, AuthForm } from './AuthForm';
import { AuthError, AuthNotice } from './AuthNotice';
import { plainLink, type AuthLinkRenderer } from './AuthLinkRenderer';
import styles from './Auth.module.css';

export interface ResetPasswordFormProps {
  /** The password policy in one sentence, under the box. */
  passwordHint: string;
  error?: string | undefined;
  /** The link has run out or was used: the form gives way to a way to ask for a new one. */
  expired?: boolean;
  pending?: boolean;
  /** The new password, typed twice, once the person submits it. The form never sends anything itself. */
  onSubmit: (values: { password: string; confirm: string }) => void;
  signInHref: string;
  newLinkHref: string;
  renderLink?: AuthLinkRenderer;
}

/**
 * Setting a new password from an emailed link (auth.md §7), for core and every app. The boxes are read when the form is sent, as in
 * `SignInForm`: a password manager can fill them without telling the page.
 */
export function ResetPasswordForm({
  passwordHint,
  error,
  expired = false,
  pending = false,
  onSubmit,
  signInHref,
  newLinkHref,
  renderLink = plainLink,
}: ResetPasswordFormProps) {
  if (expired) {
    return (
      <>
        <AuthNotice tone="warning">
          This link has expired or was already used. A link works once, for an hour.
        </AuthNotice>
        <AuthFooter>
          {renderLink({
            href: newLinkHref,
            className: styles.link,
            children: 'Request a new link',
          })}
        </AuthFooter>
      </>
    );
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const boxes = new FormData(event.currentTarget);
    onSubmit({
      password: String(boxes.get('password') ?? ''),
      confirm: String(boxes.get('confirm') ?? ''),
    });
  }

  return (
    <>
      <AuthForm onSubmit={submit}>
        <AuthField label="New password" hint={passwordHint}>
          {(control) => (
            <Input
              {...control}
              type="password"
              name="password"
              autoComplete="new-password"
              required
              disabled={pending}
            />
          )}
        </AuthField>
        <AuthField label="Confirm new password">
          {(control) => (
            <Input
              {...control}
              type="password"
              name="confirm"
              autoComplete="new-password"
              required
              disabled={pending}
            />
          )}
        </AuthField>
        {error ? <AuthError>{error}</AuthError> : null}
        <AuthButton type="submit" loading={pending}>
          {pending ? 'Saving…' : 'Set new password'}
        </AuthButton>
      </AuthForm>
      <AuthFooter>
        {renderLink({ href: signInHref, className: styles.link, children: 'Back to sign in' })}
      </AuthFooter>
    </>
  );
}
