import { NextResponse } from 'next/server';
import {
  authorizationResponse,
  requireCapability,
  requireSameOrigin,
} from '../../../../src/auth/authorize';
import { removalAttributes, sessionCacheCookieNames } from '../../../../src/auth/cookies';
import { getAuthSettings } from '../../../../src/auth/settings';
import { getDatabase } from '../../../../src/database';
import { ImageError } from '../../../../src/images/validate';
import { AvatarStore, readLimited } from '../../../../src/profile/avatars';

export const dynamic = 'force-dynamic';

function withFreshSession(response: NextResponse): NextResponse {
  const { cookieDomain } = getAuthSettings();
  // better-auth's session cache cookie, under every name it can have: a changed picture must not be hidden by it.
  for (const name of sessionCacheCookieNames()) {
    response.cookies.set(name, '', removalAttributes(name, cookieDomain));
  }
  response.headers.set('cache-control', 'no-store');
  return response;
}

/** Sets the signed-in person's picture from the request's body: the picture itself, not a form. */
export async function POST(request: Request): Promise<Response> {
  try {
    requireSameOrigin(request);
    const session = await requireCapability('profile:manage');
    const bytes = await readLimited(request);
    const { path } = await new AvatarStore(await getDatabase()).set(session.user.id, bytes);
    return withFreshSession(NextResponse.json({ image: path }));
  } catch (error) {
    if (error instanceof ImageError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: error.code === 'too-large' ? 413 : 400 },
      );
    }
    const refused = authorizationResponse(error);
    if (refused) return refused;
    throw error;
  }
}

/** Removes the signed-in person's picture. */
export async function DELETE(request: Request): Promise<Response> {
  try {
    requireSameOrigin(request);
    const session = await requireCapability('profile:manage');
    await new AvatarStore(await getDatabase()).remove(session.user.id);
    return withFreshSession(NextResponse.json({ image: null }));
  } catch (error) {
    const refused = authorizationResponse(error);
    if (refused) return refused;
    throw error;
  }
}
