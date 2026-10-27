import type { VerifyEmailCopy } from './copy';
import type { EmailBranding } from './branding';
import { EmailButton } from './components/EmailButton';
import { EmailLayout } from './components/EmailLayout';
import { Lead, Note } from './components/EmailText';
import { brandColor } from './branding';

export interface VerifyEmailEmailProps {
  verifyUrl: string;
  branding: EmailBranding;
  copy: VerifyEmailCopy;
}

export function VerifyEmailEmail({ verifyUrl, branding, copy }: VerifyEmailEmailProps) {
  return (
    <EmailLayout branding={branding} preview={copy.intro}>
      <Lead>{copy.intro}</Lead>
      <EmailButton href={verifyUrl} color={brandColor(branding)}>
        {copy.cta}
      </EmailButton>
      <Note first>{copy.expiry}</Note>
      <Note>{copy.ignore}</Note>
    </EmailLayout>
  );
}

export default VerifyEmailEmail;
