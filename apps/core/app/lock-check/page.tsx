import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Card } from '@sovereignfs/ui';
import { requireSignedIn } from '../../src/auth/require-signed-in';
import { getAuthSettings } from '../../src/auth/settings';
import { getConfig } from '../../src/config';
import { can } from '../../src/roles/capabilities';
import { getCapabilityMatrix } from '../../src/roles/matrix';
import { LockCheck } from './lock-check';

export const metadata: Metadata = { title: 'Lock check' };

/**
 * What an installed core can do towards a biometric lock, tried on a device (task 4.15, research 0012): make a passkey here, ask
 * for one after a tap and without one, read its PRF output, and see how long the device keeps the app in the background. On a
 * development or staging instance it is anyone's who is signed in; on production, only someone who holds `instance:diagnose`, which
 * is the owner's alone, and anyone else is answered as if there were no such page. No answer is sent to the server.
 */
export default async function LockCheckPage() {
  const session = await requireSignedIn('/lock-check');
  if (
    getConfig().environment === 'production' &&
    !can(session.user.role, 'instance:diagnose', await getCapabilityMatrix())
  ) {
    notFound();
  }
  return (
    <Card padding="lg">
      <LockCheck rpId={getAuthSettings().webauthn.rpId} />
    </Card>
  );
}
