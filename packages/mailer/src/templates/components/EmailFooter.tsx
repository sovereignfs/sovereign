import { Hr, Link, Section, Text } from 'react-email';
import type { EmailBranding } from '../branding';

export function EmailFooter({ branding }: { branding: EmailBranding }) {
  return (
    <Section style={{ padding: '0 40px 32px' }}>
      <Hr style={{ borderColor: '#e5e5e5', margin: '24px 0' }} />
      <Text style={{ fontSize: 12, color: '#71717a', margin: 0 }}>
        {branding.name} —{' '}
        <Link href={branding.instanceUrl} style={{ color: '#71717a' }}>
          {branding.instanceUrl}
        </Link>
      </Text>
    </Section>
  );
}
