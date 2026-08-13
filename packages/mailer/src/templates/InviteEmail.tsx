import { Button, Text } from 'react-email';
import type { InviteCopy } from './copy';
import { DEFAULT_PRIMARY_COLOR, type EmailBranding } from './branding';
import { EmailLayout } from './components/EmailLayout';

export interface InviteEmailProps {
  registerUrl: string;
  branding: EmailBranding;
  copy: InviteCopy;
}

export function InviteEmail({ registerUrl, branding, copy }: InviteEmailProps) {
  return (
    <EmailLayout branding={branding} preview={copy.intro}>
      <Text style={{ fontSize: 15, color: '#18181b', margin: '0 0 16px' }}>{copy.intro}</Text>
      <Button
        href={registerUrl}
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
    </EmailLayout>
  );
}

export default InviteEmail;
