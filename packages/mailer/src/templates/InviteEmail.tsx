import { Button, Hr, Section, Text } from '@react-email/components';
import type { EmailBranding, EmailCopyMap } from './index';
import { EmailLayout } from './components/EmailLayout';

interface InviteEmailProps {
  registerUrl: string;
  branding: EmailBranding;
  copy: EmailCopyMap['invite'];
}

export function InviteEmail({ registerUrl, branding, copy }: InviteEmailProps) {
  const accentColor = branding.primaryColor ?? '#09090b';
  return (
    <EmailLayout branding={branding} preview={copy.intro}>
      <Text style={{ fontSize: 16, color: '#09090b', lineHeight: 1.6, margin: '0 0 20px' }}>
        {copy.intro}
      </Text>
      <Section style={{ textAlign: 'center', margin: '28px 0' }}>
        <Button
          href={registerUrl}
          style={{
            backgroundColor: accentColor,
            color: '#ffffff',
            padding: '12px 28px',
            borderRadius: 6,
            fontSize: 15,
            fontWeight: 600,
            textDecoration: 'none',
            display: 'inline-block',
          }}
        >
          {copy.cta}
        </Button>
      </Section>
      <Hr style={{ borderColor: '#e5e5e5', margin: '24px 0' }} />
      <Text style={{ fontSize: 13, color: '#71717a', margin: '0 0 8px' }}>{copy.expiry}</Text>
      <Text style={{ fontSize: 13, color: '#71717a', margin: 0 }}>{copy.footer}</Text>
    </EmailLayout>
  );
}
