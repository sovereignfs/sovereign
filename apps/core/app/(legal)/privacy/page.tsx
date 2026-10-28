import type { Metadata } from 'next';
import { PRIVACY } from '../../../src/legal/content';
import { LegalPage } from '../legal-page';

export const metadata: Metadata = { title: PRIVACY.title };

export default function PrivacyPage() {
  return <LegalPage document={PRIVACY} other={{ label: 'Terms of Service', href: '/tos' }} />;
}
