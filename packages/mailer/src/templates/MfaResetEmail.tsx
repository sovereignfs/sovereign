import type { MfaResetCopy } from './copy';
import type { EmailBranding } from './branding';
import { EmailButton } from './components/EmailButton';
import { EmailLayout } from './components/EmailLayout';
import { Lead, Note } from './components/EmailText';
import { brandColor } from './branding';

export interface MfaResetEmailProps {
  signInUrl: string;
  branding: EmailBranding;
  copy: MfaResetCopy;
}

export function MfaResetEmail({ signInUrl, branding, copy }: MfaResetEmailProps) {
  return (
    <EmailLayout branding={branding} preview={copy.intro}>
      <Lead>{copy.intro}</Lead>
      <Lead>{copy.next}</Lead>
      <EmailButton href={signInUrl} color={brandColor(branding)}>
        {copy.cta}
      </EmailButton>
      <Note first>{copy.ignore}</Note>
    </EmailLayout>
  );
}

export default MfaResetEmail;
