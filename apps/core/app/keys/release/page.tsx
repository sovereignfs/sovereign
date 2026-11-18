import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { getAuth, getAuthSettings } from '../../../src/auth';
import { requireSignedIn } from '../../../src/auth/require-signed-in';
import { getInstanceIdentity } from '../../../src/instance/service';
import { readReleaseTarget } from '../../../src/keys/release-target';
import { queryOf } from '../../../src/oauth/signed-query';
import { AuthCard } from '../../(auth)/auth-card';
import { ReleaseFlow } from './release-flow';

export const metadata: Metadata = { title: 'Opening an app', referrer: 'no-referrer' };

/**
 * Key release (core-app §5.7, RFC 0005 §4): an app's page sends the person here when it has no key, and gets it back in the
 * address's fragment. Rendered per request, like every page (it reads the query), never framed (`frame-ancestors 'none'`).
 */
export default async function KeyReleasePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  // The proxy turns away a request with no session cookie; this is the check that counts.
  const session = await requireSignedIn(`/keys/release?${queryOf(query)}`);
  // Every way of being wrong gets the page that is not there: a site that sends a person here learns nothing.
  const target = await readReleaseTarget(await getAuth(), query);
  if (!target) notFound();
  const { name } = await getInstanceIdentity();
  // Silently only for a request the browser says came from the app's own pages. A site that sends the person here with a public key
  // of its own gets nothing it can open unless something on the app's page reads the fragment first; asking closes even that.
  const fromApp =
    refererOrigin((await headers()).get('referer')) === new URL(target.returnTo).origin;

  return (
    <AuthCard title={`Opening ${target.appName}`} legal={false}>
      <ReleaseFlow
        target={{
          clientId: target.clientId,
          returnTo: target.returnTo,
          request: target.request,
          state: target.state,
        }}
        appName={target.appName}
        email={session.user.email}
        rpId={getAuthSettings().webauthn.rpId}
        instanceName={name}
        confirm={!fromApp}
      />
    </AuthCard>
  );
}

function refererOrigin(referer: string | null): string | undefined {
  try {
    return referer ? new URL(referer).origin : undefined;
  } catch {
    return undefined;
  }
}
