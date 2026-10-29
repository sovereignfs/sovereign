import { oauthProviderOpenIdConfigMetadata } from '@better-auth/oauth-provider';
import { getAuth } from '../../../src/auth';

// The instance's own address is the issuer, so the document says where it was asked for and is built per
// request; an app needs only the instance URL to find everything else (core-app §3.6.1).
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  return oauthProviderOpenIdConfigMetadata(await getAuth())(request);
}
