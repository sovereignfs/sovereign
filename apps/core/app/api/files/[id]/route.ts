import { NextResponse } from 'next/server';
import {
  authorizationResponse,
  requireCapability,
  requireSameOrigin,
} from '../../../../src/auth/authorize';
import { getFileStore } from '../../../../src/files';
import { storageErrorResponse } from '../../../../src/files/respond';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

/**
 * One file, to its owner (core-app §4.6): to their session, or to an address core signed for them that has not run out. A file that
 * is not theirs is the same as none.
 */
export async function GET(request: Request, { params }: Context): Promise<Response> {
  try {
    const { id } = await params;
    const files = getFileStore();
    const query = new URL(request.url).searchParams;
    const sub = query.has('signature')
      ? files.signedFor(id, query)
      : (await requireCapability('files:manage')).user.id;
    if (!sub) {
      return NextResponse.json(
        {
          error: 'expired',
          message: 'This link has run out. Open the file again from your account.',
        },
        { status: 403 },
      );
    }
    return await files.serve(sub, id, request);
  } catch (error) {
    return storageErrorResponse(error) ?? authorizationResponse(error) ?? Promise.reject(error);
  }
}

/** Deletes one of the signed-in person's files, and gives back its space. */
export async function DELETE(request: Request, { params }: Context): Promise<Response> {
  try {
    requireSameOrigin(request);
    const session = await requireCapability('files:manage');
    const { id } = await params;
    await getFileStore().remove(session.user.id, id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return storageErrorResponse(error) ?? authorizationResponse(error) ?? Promise.reject(error);
  }
}
