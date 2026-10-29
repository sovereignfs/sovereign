import { NextResponse } from 'next/server';
import {
  authorizationResponse,
  requireCapability,
  requireSameOrigin,
} from '../../../../../src/auth/authorize';
import { isBrandingKind } from '../../../../../src/branding/store';
import { getInstanceManager } from '../../../../../src/instance/service';
import { InstanceError } from '../../../../../src/instance/manage';
import { ImageError } from '../../../../../src/images/validate';
import { readLimited } from '../../../../../src/profile/avatars';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ kind: string }> };

/** Sets one of the instance's pictures from the request's body: the picture itself, not a form. */
export async function POST(request: Request, { params }: Context): Promise<Response> {
  try {
    requireSameOrigin(request);
    const session = await requireCapability('instance:configure');
    const { kind } = await params;
    if (!isBrandingKind(kind)) return NextResponse.json({ error: 'not-found' }, { status: 404 });
    const bytes = await readLimited(request);
    const picture = await (await getInstanceManager()).setImage(session.user, kind, bytes);
    return NextResponse.json({ image: picture.path }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    if (error instanceof ImageError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: error.code === 'too-large' ? 413 : 400 },
      );
    }
    if (error instanceof InstanceError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: 403 });
    }
    const refused = authorizationResponse(error);
    if (refused) return refused;
    throw error;
  }
}

/** Removes one of the instance's pictures. */
export async function DELETE(request: Request, { params }: Context): Promise<Response> {
  try {
    requireSameOrigin(request);
    const session = await requireCapability('instance:configure');
    const { kind } = await params;
    if (!isBrandingKind(kind)) return NextResponse.json({ error: 'not-found' }, { status: 404 });
    await (await getInstanceManager()).removeImage(session.user, kind);
    return NextResponse.json({ image: null }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    if (error instanceof InstanceError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: 403 });
    }
    const refused = authorizationResponse(error);
    if (refused) return refused;
    throw error;
  }
}
