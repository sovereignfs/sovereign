import type { Metadata } from 'next';
import { getAuthSettings } from '../../../src/auth';
import { requireSignedIn } from '../../../src/auth/require-signed-in';
import { safeReturnTo } from '../../../src/auth/return-to';
import { getInstanceIdentity } from '../../../src/instance/service';
import { kitAddress } from '../../../src/keys/kit-step';
import { AuthCard } from '../../(auth)/auth-card';
import { KitFlow } from './kit-flow';

export const metadata: Metadata = { title: 'Your recovery kit' };

/**
 * The recovery kit (core-app §5.3): where signing in and signing up send a person who has not kept it, and where the Security page
 * offers it. The kit is made, shown and given its way into the keys in the browser; the server learns only that it was kept.
 */
export default async function KeyKitPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const returnTo = safeReturnTo((await searchParams).returnTo);
  // The proxy turns away a request with no session cookie; this is the check that counts.
  const session = await requireSignedIn(kitAddress(returnTo));
  const { name } = await getInstanceIdentity();
  return (
    <AuthCard title="Your recovery kit" legal={false}>
      <KitFlow
        instanceName={name}
        email={session.user.email}
        rpId={getAuthSettings().webauthn.rpId}
        returnTo={returnTo}
      />
    </AuthCard>
  );
}
