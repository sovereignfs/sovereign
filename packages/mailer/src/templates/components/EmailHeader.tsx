import { Img, Section, Text } from '@react-email/components';
import type { EmailBranding } from '../index';

interface EmailHeaderProps {
  branding: EmailBranding;
}

export function EmailHeader({ branding }: EmailHeaderProps) {
  return (
    <Section
      style={{
        backgroundColor: '#f9f9f9',
        padding: '24px 40px',
        borderBottom: '1px solid #e5e5e5',
      }}
    >
      {branding.logoUrl ? (
        <Img src={branding.logoUrl} alt={branding.name} height={40} style={{ display: 'block' }} />
      ) : (
        <Text
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: '#09090b',
            margin: 0,
          }}
        >
          {branding.name}
        </Text>
      )}
    </Section>
  );
}
