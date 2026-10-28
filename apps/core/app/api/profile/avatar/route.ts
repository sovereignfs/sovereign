import { NextResponse } from 'next/server';
import {
  authorizationResponse,
  requireCapability,
  requireSameOrigin,
} from '../../../../src/auth/authorize';
import { getAuthSettings } from '../../../../src/auth/settings';
import { getDatabase } from '../../../../src/database';
import { ImageError } from '../../../../src/images/validate';
import { AvatarStore, readLimited } from '../../../../src/profile/avatars';

export const dynamic = 'force-dynamic';

/** better-auth's session cache cookie, under both of its names: a changed picture must not be hidden by it. */
const CACHE_COOKIES = ['better-auth.session_data', '__Secure-better-auth.session_data'];

function withFreshSession(response: NextResponse): NextResponse {
  const { cookieDomain } = getAuthSettings();
  for (const name of CACHE_COOKIES) {
    response.cookies.set(name, '', {
      maxAge: 0,
      path: '/',
      ...(cookieDomain ? { domain: cookieDomain } : {}),
    });
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
