import type { AppMessageCopy } from './copy';
import type { EmailBranding } from './branding';
import { EmailButton } from './components/EmailButton';
import { EmailLayout } from './components/EmailLayout';
import { Lead, Note } from './components/EmailText';
import { brandColor } from './branding';
import { Link, Text } from 'react-email';

export interface AppMessageEmailProps {
  branding: EmailBranding;
  copy: AppMessageCopy;
  subject: string;
  /** Plain text. Each line is kept as the app wrote it; nothing in it is read as markup. */
  body: string;
  /** One link on the app's own address, drawn as the button. */
  link?: string | undefined;
  /** Where the person switches the app's emails off, on the instance. */
  manageUrl: string;
}

export function AppMessageEmail({
  branding,
  copy,
  subject,
  body,
  link,
  manageUrl,
}: AppMessageEmailProps) {
  return (
    <EmailLayout branding={branding} preview={subject}>
      <Note first={false}>{copy.fromApp}</Note>
      <Text style={{ fontSize: 18, fontWeight: 600, color: '#18181b', margin: '12px 0 16px' }}>
        {subject}
      </Text>
      <Lead>
        <span style={{ whiteSpace: 'pre-wrap' }}>{body}</span>
      </Lead>
      {link ? (
        <EmailButton href={link} color={brandColor(branding)}>
          {copy.cta}
        </EmailButton>
      ) : null}
      <Note first>{copy.why}</Note>
      <Note>
        {copy.stop}{' '}
        <Link href={manageUrl} style={{ color: '#71717a' }}>
          {copy.manage}
        </Link>
      </Note>
    </EmailLayout>
  );
}

export default AppMessageEmail;
