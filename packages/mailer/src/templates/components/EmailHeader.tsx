import { Img, Section, Text } from 'react-email';
import type { EmailBranding } from '../branding';

/**
 * Renders the brand logo when `logoUrl` is set, otherwise the brand name as
 * bold text. `alt` always carries the brand name — Gmail, Outlook, and most
 * corporate mail clients block remote images by default, so the header must
 * stay legible with images off.
 */
export function EmailHeader({ branding }: { branding: EmailBranding }) {
  return (
    <Section style={{ padding: '24px 40px 0' }}>
      {branding.logoUrl ? (
        <Img src={branding.logoUrl} alt={branding.name} height={40} style={{ maxWidth: 200 }} />
      ) : (
        <Text style={{ fontSize: 18, fontWeight: 700, margin: 0, color: '#09090b' }}>
          {branding.name}
        </Text>
      )}
    </Section>
  );
}
