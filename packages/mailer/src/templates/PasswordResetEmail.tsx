import type { PasswordResetCopy } from './copy';
import type { EmailBranding } from './branding';
import { EmailButton } from './components/EmailButton';
import { EmailLayout } from './components/EmailLayout';
import { Lead, Note } from './components/EmailText';
import { brandColor } from './branding';

export interface PasswordResetEmailProps {
  resetUrl: string;
  branding: EmailBranding;
  copy: PasswordResetCopy;
}

export function PasswordResetEmail({ resetUrl, branding, copy }: PasswordResetEmailProps) {
  return (
    <EmailLayout branding={branding} preview={copy.intro}>
      <Lead>{copy.intro}</Lead>
      <EmailButton href={resetUrl} color={brandColor(branding)}>
        {copy.cta}
      </EmailButton>
      <Note first>{copy.expiry}</Note>
      <Note>{copy.ignore}</Note>
    </EmailLayout>
  );
}

export default PasswordResetEmail;
