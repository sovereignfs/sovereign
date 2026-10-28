import type { Metadata } from 'next';
import { TERMS } from '../../../src/legal/content';
import { LegalPage } from '../legal-page';

export const metadata: Metadata = { title: TERMS.title };

export default function TermsPage() {
  return <LegalPage document={TERMS} other={{ label: 'Privacy Policy', href: '/privacy' }} />;
}
