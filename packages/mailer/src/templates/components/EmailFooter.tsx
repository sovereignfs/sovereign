import { Link, Section, Text } from '@react-email/components';
import type { EmailBranding } from '../index';

interface EmailFooterProps {
  branding: EmailBranding;
}

export function EmailFooter({ branding }: EmailFooterProps) {
  return (
    <Section
      style={{
        padding: '20px 40px',
        borderTop: '1px solid #e5e5e5',
        backgroundColor: '#f9f9f9',
      }}
    >
      <Text style={{ fontSize: 12, color: '#71717a', margin: 0, textAlign: 'center' }}>
        {branding.name} &middot;{' '}
        <Link href={branding.instanceUrl} style={{ color: '#71717a' }}>
          {branding.instanceUrl}
        </Link>
      </Text>
    </Section>
  );
}
