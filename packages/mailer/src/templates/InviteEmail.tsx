import type { InviteCopy } from './copy';
import type { EmailBranding } from './branding';
import { EmailButton } from './components/EmailButton';
import { EmailLayout } from './components/EmailLayout';
import { Lead, Note } from './components/EmailText';
import { brandColor } from './branding';

export interface InviteEmailProps {
  registerUrl: string;
  branding: EmailBranding;
  copy: InviteCopy;
  /** Present only when the invitation expires; already interpolated with its date. */
  expiry?: string | undefined;
}

export function InviteEmail({ registerUrl, branding, copy, expiry }: InviteEmailProps) {
  return (
    <EmailLayout branding={branding} preview={copy.intro}>
      <Lead>{copy.intro}</Lead>
      <EmailButton href={registerUrl} color={brandColor(branding)}>
        {copy.cta}
      </EmailButton>
      {expiry ? <Note first>{expiry}</Note> : null}
      <Note first={!expiry}>{copy.ignore}</Note>
    </EmailLayout>
  );
}

export default InviteEmail;
