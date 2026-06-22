import { Body, Head, Html, Preview, Section } from '@react-email/components';
import type { ReactNode } from 'react';
import type { EmailBranding } from '../index';
import { EmailFooter } from './EmailFooter';
import { EmailHeader } from './EmailHeader';

interface EmailLayoutProps {
  branding: EmailBranding;
  preview: string;
  children: ReactNode;
}

export function EmailLayout({ branding, preview, children }: EmailLayoutProps) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body
        style={{
          backgroundColor: '#f9f9f9',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          margin: 0,
          padding: '32px 0',
        }}
      >
        <Section
          style={{
            maxWidth: 560,
            margin: '0 auto',
            backgroundColor: '#ffffff',
            borderRadius: 8,
            overflow: 'hidden',
          }}
        >
          <EmailHeader branding={branding} />
          <Section style={{ padding: '32px 40px' }}>{children}</Section>
          <EmailFooter branding={branding} />
        </Section>
      </Body>
    </Html>
  );
}
