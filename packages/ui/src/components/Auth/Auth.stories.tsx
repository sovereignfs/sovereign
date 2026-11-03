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
