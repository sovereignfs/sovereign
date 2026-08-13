import { Button, Text } from 'react-email';
import type { PasswordResetCopy } from './copy';
import { DEFAULT_PRIMARY_COLOR, type EmailBranding } from './branding';
import { EmailLayout } from './components/EmailLayout';

export interface PasswordResetEmailProps {
  resetUrl: string;
  branding: EmailBranding;
  copy: PasswordResetCopy;
}

export function PasswordResetEmail({ resetUrl, branding, copy }: PasswordResetEmailProps) {
  return (
    <EmailLayout branding={branding} preview={copy.intro}>
      <Text style={{ fontSize: 15, color: '#18181b', margin: '0 0 16px' }}>{copy.intro}</Text>
      <Button
        href={resetUrl}
        style={{
          backgroundColor: branding.primaryColor ?? DEFAULT_PRIMARY_COLOR,
          color: '#ffffff',
          fontSize: 14,
          fontWeight: 600,
          padding: '12px 24px',
          borderRadius: 6,
          textDecoration: 'none',
        }}
      >
        {copy.cta}
      </Button>
      <Text style={{ fontSize: 13, color: '#71717a', margin: '20px 0 0' }}>{copy.expiry}</Text>
      <Text style={{ fontSize: 13, color: '#71717a', margin: '8px 0 0' }}>{copy.ignore}</Text>
    </EmailLayout>
  );
}

export default PasswordResetEmail;
