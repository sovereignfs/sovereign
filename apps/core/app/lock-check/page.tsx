import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Card } from '@sovereignfs/ui';
import { requireSignedIn } from '../../src/auth/require-signed-in';
import { getAuthSettings } from '../../src/auth/settings';
import { getConfig } from '../../src/config';
import { LockCheck } from './lock-check';

export const metadata: Metadata = { title: 'Lock check' };

/**
 * What an installed core can do towards a biometric lock, tried on a device (task 4.15, research 0012): make a passkey here, ask
 * for one after a tap and without one, read its PRF output, and see how long the device keeps the app in the background. A
 * development and staging tool: a production instance has no such page. No answer is sent to the server.
 */
export default async function LockCheckPage() {
  if (getConfig().environment === 'production') notFound();
  await requireSignedIn('/lock-check');
  return (
    <Card padding="lg">
      <LockCheck rpId={getAuthSettings().webauthn.rpId} />
    </Card>
  );
}
