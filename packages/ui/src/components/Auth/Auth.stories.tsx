import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Input } from '../Input/Input';
import { AuthCard } from './AuthCard';
import { AuthCodeInput } from './AuthCodeInput';
import { AuthField } from './AuthField';
import { AuthError, AuthNotice } from './AuthNotice';
import {
  AuthButton,
  AuthDivider,
  AuthFooter,
  AuthForm,
  AuthLink,
  AuthLinkButton,
} from './AuthForm';
import { BrandBadge } from './BrandBadge';
import { ForgotPasswordForm } from './ForgotPasswordForm';
import { ResetPasswordForm } from './ResetPasswordForm';
import { SignInForm } from './SignInForm';

const meta = {
  title: 'Components/Auth',
  component: AuthCard,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The pages before sign-in, shared by every app so they look the same: `AuthCard` (mark, title, lead, legal links) around an `AuthForm` of `AuthField`s, with `AuthButton`, `AuthDivider`, `AuthFooter` and `AuthLink` for the rest, `AuthNotice` and `AuthError` for what the person is told, and `AuthCodeInput` for a one-time code. The mark is a slot: `BrandBadge` when there is no logo.',
      },
    },
  },
  args: { title: 'Sign in' },
} satisfies Meta<typeof AuthCard>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------

export const SignIn: Story = {
  render: () => (
    <AuthCard brand={<BrandBadge name="Sovereign" />} title="Sign in to Sovereign">
      <AuthForm>
        <AuthField label="Email">
          {(control) => <Input {...control} type="email" required />}
        </AuthField>
        <AuthField label="Password" aside={<a href="/forgot-password">Forgot password?</a>}>
          {(control) => <Input {...control} type="password" required />}
        </AuthField>
        <AuthButton type="submit">Sign in</AuthButton>
      </AuthForm>
      <AuthDivider />
      <AuthButton variant="secondary">Sign in with a passkey</AuthButton>
      <AuthFooter>
        New to Sovereign? <AuthLink href="/sign-up">Create account</AuthLink>
      </AuthFooter>
    </AuthCard>
  ),
};

export const WithNoticeAndError: Story = {
  render: () => (
    <AuthCard brand={<BrandBadge name="Sovereign" />} title="Sign in to Sovereign" legal={false}>
      <AuthNotice>Your password is changed. Sign in with the new one.</AuthNotice>
      <AuthForm>
        <AuthField label="Email" error="Enter a valid email address.">
          {(control) => <Input {...control} type="email" defaultValue="nobody" />}
        </AuthField>
        <AuthError>The email or password is incorrect.</AuthError>
        <AuthButton type="submit">Sign in</AuthButton>
      </AuthForm>
    </AuthCard>
  ),
};

export const SecondStep: Story = {
  render: function Render() {
    const [code, setCode] = useState('');
    return (
      <AuthCard
        brand={<BrandBadge name="Sovereign" />}
        title="Two-step verification"
        lead="Enter the 6-digit code from your authenticator app."
      >
        <AuthForm>
          <AuthCodeInput label="Authenticator code" value={code} onChange={setCode} />
          <AuthButton type="submit">Verify</AuthButton>
        </AuthForm>
        <AuthFooter>
          Lost access to your authenticator?
          <br />
          <AuthLinkButton>Use a backup code</AuthLinkButton>
        </AuthFooter>
      </AuthCard>
    );
  },
};

// ---------------------------------------------------------------------------

/** The whole sign-in form, as core and every app use it: the consumer signs in and passes back what happened. */
export const SignInFormStory: Story = {
  name: 'SignInForm',
  render: () => (
    <AuthCard brand={<BrandBadge name="Sovereign" />} title="Sign in to Sovereign">
      <SignInForm
        appName="Sovereign"
        onSubmit={() => undefined}
        passkey={{ pending: false, onClick: () => undefined }}
        forgotPasswordHref="/forgot-password"
        signUpHref="/sign-up"
      />
    </AuthCard>
  ),
};

/** Refused, with an address to verify first and no passkey on this browser. */
export const SignInFormRefused: Story = {
  name: 'SignInForm, refused',
  render: () => (
    <AuthCard brand={<BrandBadge name="Sovereign" />} title="Sign in to Sovereign">
      <SignInForm
        appName="Sovereign"
        error="The email or password is incorrect."
        unverified
        renderUnverified={() => <AuthLinkButton>Send the link again</AuthLinkButton>}
        onSubmit={() => undefined}
        forgotPasswordHref="/forgot-password"
        signUpHref="/sign-up"
      />
    </AuthCard>
  ),
};

/** Asking for a reset link, and what it says once sent. */
export const ForgotPasswordFormStory: Story = {
  name: 'ForgotPasswordForm',
  render: () => (
    <AuthCard brand={<BrandBadge name="Sovereign" />} title="Reset your password">
      <ForgotPasswordForm onSubmit={() => undefined} signInHref="/sign-in" />
    </AuthCard>
  ),
};

export const ForgotPasswordFormSent: Story = {
  name: 'ForgotPasswordForm, sent',
  render: () => (
    <AuthCard brand={<BrandBadge name="Sovereign" />} title="Reset your password">
      <ForgotPasswordForm
        sentTo="ada@example.com"
        onSubmit={() => undefined}
        signInHref="/sign-in"
      />
    </AuthCard>
  ),
};

/** A new password from the emailed link, and the link run out. */
export const ResetPasswordFormStory: Story = {
  name: 'ResetPasswordForm',
  render: () => (
    <AuthCard brand={<BrandBadge name="Sovereign" />} title="Choose a new password">
      <ResetPasswordForm
        passwordHint="At least 8 characters."
        onSubmit={() => undefined}
        signInHref="/sign-in"
        newLinkHref="/forgot-password"
      />
    </AuthCard>
  ),
};

export const ResetPasswordFormExpired: Story = {
  name: 'ResetPasswordForm, expired',
  render: () => (
    <AuthCard brand={<BrandBadge name="Sovereign" />} title="Choose a new password">
      <ResetPasswordForm
        passwordHint="At least 8 characters."
        expired
        onSubmit={() => undefined}
        signInHref="/sign-in"
        newLinkHref="/forgot-password"
      />
    </AuthCard>
  ),
};
