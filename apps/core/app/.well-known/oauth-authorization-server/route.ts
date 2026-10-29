import { oauthProviderAuthServerMetadata } from '@better-auth/oauth-provider';
import { getAuth } from '../../../src/auth';

// The same document at the address OAuth 2.0 clients look for (RFC 8414).
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  return oauthProviderAuthServerMetadata(await getAuth())(request);
}
