import { auth } from '@/lib/auth';
import { failure, files, refuseCrossOrigin, unauthorised } from '@/lib/files';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

/** One file, to its owner: to their session, or through an address signed for them that has not run out. Someone else's is not found. */
export async function GET(request: Request, { params }: Context) {
  const { id } = await params;
  const query = new URL(request.url).searchParams;
  const sub = query.has('signature')
    ? files().signedFor(id, query)
    : (await auth().getSession())?.sub;
  if (!sub) return query.has('signature') ? expired() : unauthorised();
  try {
    return await files().serve(sub, id, request);
  } catch (error) {
    const known = failure(error);
    if (known) return known;
    throw error;
  }
}

/** Deletes one of the signed-in person's files and gives its space back. */
export async function DELETE(request: Request, { params }: Context) {
  const refused = refuseCrossOrigin(request);
  if (refused) return refused;
  const session = await auth().getSession();
  if (!session) return unauthorised();
  try {
    await files().remove(session.sub, (await params).id);
    return new Response(null, { status: 204 });
  } catch (error) {
    const known = failure(error);
    if (known) return known;
    throw error;
  }
}

const expired = () =>
  Response.json(
    { error: 'expired', message: 'This link has run out. Open the file again from the app.' },
    { status: 403 },
  );
