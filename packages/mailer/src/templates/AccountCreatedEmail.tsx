import type { AccountCreatedCopy } from './copy';
import type { EmailBranding } from './branding';
import { EmailButton } from './components/EmailButton';
import { EmailLayout } from './components/EmailLayout';
import { Lead, Note } from './components/EmailText';
import { brandColor } from './branding';

export interface AccountCreatedEmailProps {
  signInUrl: string;
  branding: EmailBranding;
  copy: AccountCreatedCopy;
  /** Already interpolated; absent when the person's name is not known. */
  greeting?: string | undefined;
}

export function AccountCreatedEmail({
  signInUrl,
  branding,
  copy,
  greeting,
}: AccountCreatedEmailProps) {
  return (
    <EmailLayout branding={branding} preview={copy.intro}>
      {greeting ? <Lead>{greeting}</Lead> : null}
      <Lead>{copy.intro}</Lead>
      <EmailButton href={signInUrl} color={brandColor(branding)}>
        {copy.cta}
      </EmailButton>
      <Note first>{copy.ignore}</Note>
    </EmailLayout>
  );
}

export default AccountCreatedEmail;
